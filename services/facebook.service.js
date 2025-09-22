const axios = require('axios');
const FacebookIntegration = require('../models/FacebookIntegration');
const logger = require('../utils/logger');

class FacebookService {
  constructor() {
    this.baseURL = 'https://graph.facebook.com/v19.0';
    this.appId = process.env.FB_APP_ID;
    this.appSecret = process.env.FB_APP_SECRET;
    this.verifyToken = process.env.FB_VERIFY_TOKEN;
  }

  // Generate OAuth URL for Facebook login
  generateOAuthURL(state) {
    const scopes = 'pages_show_list,leads_retrieval,pages_read_engagement,pages_manage_metadata,pages_manage_ads';
    const redirectUri = `${process.env.API_URL || 'http://localhost:3005'}/api/integrations/facebook/oauth/callback`;
    
    return `https://www.facebook.com/v19.0/dialog/oauth?client_id=${this.appId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${state}&response_type=code`;
  }

  // Handle OAuth callback and save integration
  async handleOAuthCallback(code, state) {
    try {
      const { userId, organizationId } = JSON.parse(Buffer.from(state, 'base64').toString());
      const redirectUri = `${process.env.API_URL || 'http://localhost:3005'}/api/integrations/facebook/oauth/callback`;
      
      // Exchange code for access token
      const tokenResponse = await axios.get(`${this.baseURL}/oauth/access_token`, {
        params: {
          client_id: this.appId,
          redirect_uri: redirectUri,
          client_secret: this.appSecret,
          code: code
        }
      });

      const shortLivedToken = tokenResponse.data.access_token;

      // Exchange for long-lived token
      const longLivedResponse = await axios.get(`${this.baseURL}/oauth/access_token`, {
        params: {
          grant_type: 'fb_exchange_token',
          client_id: this.appId,
          client_secret: this.appSecret,
          fb_exchange_token: shortLivedToken
        }
      });

      const longLivedToken = longLivedResponse.data.access_token;

      // Get user info
      const userResponse = await axios.get(`${this.baseURL}/me`, {
        params: {
          access_token: longLivedToken,
          fields: 'id,name,picture'
        }
      });

      // Get user's pages
      const pagesResponse = await axios.get(`${this.baseURL}/me/accounts`, {
        params: {
          access_token: longLivedToken,
          fields: 'id,name,picture,access_token'
        }
      });

      // Process pages and get lead forms
      const pages = await Promise.all(
        pagesResponse.data.data.map(async (page) => {
          let leadForms = [];
          try {
            logger.info(`Fetching forms for page: ${page.id} (${page.name})`);
            const formsResponse = await axios.get(`${this.baseURL}/${page.id}/leadgen_forms`, {
              params: {
                access_token: page.access_token,
                fields: 'id,name,status,leads_count,created_time'
              }
            });
            logger.info(`Forms response for page ${page.id}:`, formsResponse.data);
            
            leadForms = formsResponse.data.data.map(form => ({
              id: form.id,
              name: form.name,
              status: form.status,
              leadsCount: form.leads_count,
              enabled: true,
              totalLeads: 0
            }));
            
            logger.info(`Processed forms for page ${page.id}:`, leadForms);
          } catch (error) {
            logger.error(`Error fetching forms for page ${page.id}:`, error.response?.data || error.message);
            // Try with user token as fallback
            try {
              logger.info(`Trying with user token for page: ${page.id}`);
              const formsResponse = await axios.get(`${this.baseURL}/${page.id}/leadgen_forms`, {
                params: {
                  access_token: longLivedToken,
                  fields: 'id,name,status,leads_count,created_time'
                }
              });
              logger.info(`Forms response with user token for page ${page.id}:`, formsResponse.data);
              
              leadForms = formsResponse.data.data.map(form => ({
                id: form.id,
                name: form.name,
                status: form.status,
                leadsCount: form.leads_count,
                enabled: true,
                totalLeads: 0
              }));
              
              logger.info(`Processed forms with user token for page ${page.id}:`, leadForms);
            } catch (userTokenErr) {
              logger.error(`Error fetching forms with user token for page ${page.id}:`, userTokenErr.response?.data || userTokenErr.message);
              leadForms = [];
            }
          }
          
          return {
            id: page.id,
            name: page.name,
            accessToken: page.access_token,
            picture: page.picture?.data?.url || '',
            leadForms: leadForms
          };
        })
      );

      // Subscribe pages to webhooks
      for (const page of pages) {
        try {
          await axios.post(`${this.baseURL}/${page.id}/subscribed_apps`, null, {
            params: {
              access_token: page.accessToken,
              subscribed_fields: 'leadgen'
            }
          });
          page.isSubscribed = true;
        } catch (error) {
          logger.error('Error subscribing page to webhooks:', page.id, error.message);
          page.isSubscribed = false;
        }
      }

      // Save or update integration
      const integration = await FacebookIntegration.findOneAndUpdate(
        { organizationId },
        {
          userId,
          organizationId,
          connected: true,
          fbUserId: userResponse.data.id,
          fbUserName: userResponse.data.name,
          fbUserPicture: userResponse.data.picture?.data?.url || '',
          userAccessToken: longLivedToken,
          tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
          fbPages: pages,
          'stats.lastSync': new Date()
        },
        { upsert: true, new: true }
      );

      return integration;
    } catch (error) {
      logger.error('Facebook OAuth error:', error.response?.data || error.message, 'Full error:', error);
      throw new Error(`Failed to connect Facebook account: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Sync pages from Facebook
  async syncPages(integration) {
    try {
      if (!integration.userAccessToken) {
        throw new Error('No access token available');
      }

      // Get user's pages
      const pagesResponse = await axios.get(`${this.baseURL}/me/accounts`, {
        params: {
          access_token: integration.userAccessToken,
          fields: 'id,name,picture,access_token'
        }
      });

      // Process pages and get lead forms
      const pages = await Promise.all(
        pagesResponse.data.data.map(async (page) => {
          let leadForms = [];
          try {
            logger.info(`Syncing forms for page: ${page.id} (${page.name})`);
            const formsResponse = await axios.get(`${this.baseURL}/${page.id}/leadgen_forms`, {
              params: {
                access_token: page.access_token,
                fields: 'id,name'
              }
            });
            logger.info(`Sync forms response for page ${page.id}:`, formsResponse.data);

            leadForms = formsResponse.data.data.map(form => ({
              id: form.id,
              name: form.name,
              enabled: true,
              totalLeads: 0
            }));
            
            logger.info(`Sync processed forms for page ${page.id}:`, leadForms);
          } catch (error) {
            logger.error(`Sync error fetching forms for page ${page.id}:`, error.response?.data || error.message);
            // Try with user token as fallback
            try {
              logger.info(`Sync trying with user token for page: ${page.id}`);
              const formsResponse = await axios.get(`${this.baseURL}/${page.id}/leadgen_forms`, {
                params: {
                  access_token: integration.userAccessToken,
                  fields: 'id,name'
                }
              });
              logger.info(`Sync forms response with user token for page ${page.id}:`, formsResponse.data);
              
              leadForms = formsResponse.data.data.map(form => ({
                id: form.id,
                name: form.name,
                enabled: true,
                totalLeads: 0
              }));
              
              logger.info(`Sync processed forms with user token for page ${page.id}:`, leadForms);
            } catch (userTokenErr) {
              logger.error(`Sync error fetching forms with user token for page ${page.id}:`, userTokenErr.response?.data || userTokenErr.message);
              leadForms = [];
            }
          }

          return {
            id: page.id,
            name: page.name,
            accessToken: page.access_token,
            picture: page.picture?.data?.url || '',
            isSubscribed: false,
            leadForms: leadForms
          };
        })
      );

      // Update integration with new pages
      integration.fbPages = pages;
      integration.stats.lastSync = new Date();
      await integration.save();

      return pages;
    } catch (error) {
      logger.error('Error syncing Facebook pages:', error.message);
      throw new Error('Failed to sync pages');
    }
  }

  // Test Facebook connection
  async testConnection(credentials) {
    try {
      const { accessToken, pageId } = credentials;
      
      if (!accessToken) {
        throw new Error('Access token is required');
      }

      // Test access token validity
      const response = await axios.get(`${this.baseURL}/me`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,accounts{name,access_token}'
        }
      });

      const userData = response.data;
      
      // If pageId is provided, verify access to that page
      if (pageId && userData.accounts) {
        const pageAccess = userData.accounts.data.find(account => account.id === pageId);
        if (!pageAccess) {
          throw new Error('No access to specified page');
        }
      }

      return {
        success: true,
        data: {
          userId: userData.id,
          userName: userData.name,
          pages: userData.accounts?.data || []
        }
      };

    } catch (error) {
      logger.error('Facebook connection test failed:', error);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  // Get Facebook lead forms
  async getLeadForms(credentials) {
    try {
      const { accessToken, pageId } = credentials;

      const response = await axios.get(`${this.baseURL}/${pageId}/leadgen_forms`, {
        params: {
          access_token: accessToken,
          fields: 'id,name,status,leads_count,created_time'
        }
      });

      return {
        success: true,
        data: response.data.data
      };

    } catch (error) {
      logger.error('Get Facebook lead forms error:', error);
      throw new Error('Failed to fetch lead forms');
    }
  }

  // Get page lead forms for a specific integration and page
  async getPageLeadForms(integration, pageId) {
    try {
      if (!integration.userAccessToken) {
        throw new Error('No access token available');
      }

      // Find the page in integration
      const page = integration.fbPages.find(p => p.id === pageId);
      if (!page) {
        throw new Error('Page not found in integration');
      }

      let forms = [];
      
      // Try with page token first
      try {
        logger.info(`Getting lead forms for page: ${pageId} with page token`);
        const response = await axios.get(`${this.baseURL}/${pageId}/leadgen_forms`, {
          params: {
            access_token: page.accessToken,
            fields: 'id,name,status,leads_count,created_time,questions'
          }
        });
        
        forms = response.data.data.map(form => ({
          id: form.id,
          name: form.name,
          status: form.status,
          leadsCount: form.leads_count,
          createdTime: form.created_time,
          questions: form.questions || [],
          enabled: true
        }));
        
        logger.info(`Successfully fetched ${forms.length} lead forms for page ${pageId}`);
      } catch (pageTokenError) {
        logger.error(`Page token error for page ${pageId}:`, pageTokenError.response?.data || pageTokenError.message);
        
        // Fallback to user token
        try {
          logger.info(`Trying with user token for page: ${pageId}`);
          const response = await axios.get(`${this.baseURL}/${pageId}/leadgen_forms`, {
            params: {
              access_token: integration.userAccessToken,
              fields: 'id,name,status,leads_count,created_time,questions'
            }
          });
          
          forms = response.data.data.map(form => ({
            id: form.id,
            name: form.name,
            status: form.status,
            leadsCount: form.leads_count,
            createdTime: form.created_time,
            questions: form.questions || [],
            enabled: true
          }));
          
          logger.info(`Successfully fetched ${forms.length} lead forms for page ${pageId} with user token`);
        } catch (userTokenError) {
          logger.error(`User token error for page ${pageId}:`, userTokenError.response?.data || userTokenError.message);
          throw new Error(`Failed to fetch lead forms: ${userTokenError.response?.data?.error?.message || userTokenError.message}`);
        }
      }

      return forms;
    } catch (error) {
      logger.error('Error fetching page lead forms:', pageId, 'Error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch lead forms: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Sync Facebook leads
  async syncData(integration, syncType = 'full') {
    try {
      const { accessToken, pageId } = integration.credentials;
      let allLeads = [];
      let recordsCreated = 0;
      let recordsUpdated = 0;
      let errors = 0;

      // Get lead forms first
      const leadForms = await this.getLeadForms(integration.credentials);
      
      if (!leadForms.success) {
        throw new Error('Failed to get lead forms');
      }

      // For each lead form, get leads
      for (const form of leadForms.data) {
        try {
          let params = {
            access_token: accessToken,
            fields: 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id'
          };

          // For incremental sync, only get leads since last sync
          if (syncType === 'incremental' && integration.lastSync) {
            const since = Math.floor(new Date(integration.lastSync).getTime() / 1000);
            params.since = since;
          }

          const response = await axios.get(`${this.baseURL}/${form.id}/leads`, {
            params
          });

          const leads = response.data.data;

          for (const lead of leads) {
            try {
              // Transform Facebook lead data to CRM format
              const transformedLead = this.transformFacebookLead(lead, form, pageId);
              
              // Send to leads service
              const result = await this.createOrUpdateLead(transformedLead, integration.companyId);
              
              if (result.created) {
                recordsCreated++;
              } else {
                recordsUpdated++;
              }

              allLeads.push(transformedLead);

            } catch (leadError) {
              logger.error('Process Facebook lead error:', leadError);
              errors++;
            }
          }

        } catch (formError) {
          logger.error(`Process form ${form.id} error:`, formError);
          errors++;
        }
      }

      // Log sync activity
      const logEntry = {
        timestamp: new Date(),
        action: 'sync',
        syncType,
        status: 'success',
        recordsProcessed: allLeads.length,
        recordsCreated,
        recordsUpdated,
        errors
      };

      await this.addLogEntry(integration, logEntry);

      return {
        success: true,
        recordsProcessed: allLeads.length,
        recordsCreated,
        recordsUpdated,
        errors,
        data: allLeads
      };

    } catch (error) {
      logger.error('Facebook sync error:', error);
      
      // Log sync failure
      const logEntry = {
        timestamp: new Date(),
        action: 'sync',
        syncType,
        status: 'error',
        error: error.message
      };
      
      await this.addLogEntry(integration, logEntry);

      throw error;
    }
  }

  // Transform Facebook lead to CRM format
  transformFacebookLead(facebookLead, form, pageId) {
    const fieldData = facebookLead.field_data || [];
    const leadData = {
      externalId: facebookLead.id,
      source: 'facebook',
      sourceCampaign: facebookLead.campaign_name,
      sourceAd: facebookLead.ad_name,
      formId: form.id,
      formName: form.name,
      pageId: pageId,
      createdAt: new Date(facebookLead.created_time),
      rawData: facebookLead
    };

    // Map field data to standard fields
    fieldData.forEach(field => {
      switch (field.name.toLowerCase()) {
        case 'email':
          leadData.email = field.values[0];
          break;
        case 'full_name':
        case 'name':
          leadData.name = field.values[0];
          break;
        case 'first_name':
          leadData.firstName = field.values[0];
          break;
        case 'last_name':
          leadData.lastName = field.values[0];
          break;
        case 'phone_number':
        case 'phone':
          leadData.phone = field.values[0];
          break;
        case 'company_name':
        case 'company':
          leadData.company = field.values[0];
          break;
        case 'job_title':
        case 'title':
          leadData.jobTitle = field.values[0];
          break;
        default:
          // Store custom fields
          if (!leadData.customFields) leadData.customFields = {};
          leadData.customFields[field.name] = field.values;
      }
    });

    // Set name if not provided but first/last name exists
    if (!leadData.name && (leadData.firstName || leadData.lastName)) {
      leadData.name = `${leadData.firstName || ''} ${leadData.lastName || ''}`.trim();
    }

    return leadData;
  }

  // Create or update lead in CRM
  async createOrUpdateLead(leadData, companyId) {
    try {
      // This would typically make an API call to the leads service
      const response = await axios.post(`${process.env.LEADS_SERVICE_URL}/api/leads/import`, {
        ...leadData,
        companyId
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`
        }
      });

      return response.data;

    } catch (error) {
      logger.error('Create/update lead error:', error);
      throw error;
    }
  }

  // Add log entry to integration
  async addLogEntry(integration, logEntry) {
    try {
      if (!integration.logs) integration.logs = [];
      
      integration.logs.push(logEntry);
      
      // Keep only last 1000 log entries
      if (integration.logs.length > 1000) {
        integration.logs = integration.logs.slice(-1000);
      }
      
      await integration.save();

    } catch (error) {
      logger.error('Add log entry error:', error);
    }
  }

  // Setup Facebook webhook
  async setupWebhook(credentials, webhookUrl) {
    try {
      const { accessToken, pageId } = credentials;

      // Subscribe to page
      const response = await axios.post(`${this.baseURL}/${pageId}/subscribed_apps`, {
        subscribed_fields: 'leadgen',
        access_token: accessToken
      });

      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      logger.error('Facebook webhook setup error:', error);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }

  // Handle Facebook webhook
  async handleWebhook(payload) {
    try {
      // Process Facebook webhook payload
      if (payload.object === 'page') {
        for (const entry of payload.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === 'leadgen') {
                await this.processLeadgenWebhook(change.value);
              }
            }
          }
        }
      }

      return { success: true };

    } catch (error) {
      logger.error('Facebook webhook handling error:', error);
      throw error;
    }
  }

  // Process leadgen webhook
  async processLeadgenWebhook(value) {
    try {
      const { leadgen_id, page_id, form_id } = value;

      // Find integration by page_id
      const integration = await IntegrationConfig.findOne({
        provider: 'facebook',
        'credentials.pageId': page_id,
        isActive: true
      });

      if (!integration) {
        logger.warn('No active Facebook integration found for page:', page_id);
        return;
      }

      // Get lead details
      const response = await axios.get(`${this.baseURL}/${leadgen_id}`, {
        params: {
          access_token: integration.credentials.accessToken,
          fields: 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id'
        }
      });

      const lead = response.data;
      
      // Transform and create lead
      const transformedLead = this.transformFacebookLead(lead, { id: form_id }, page_id);
      await this.createOrUpdateLead(transformedLead, integration.companyId);

      logger.info('Facebook webhook lead processed:', leadgen_id);

    } catch (error) {
      logger.error('Process leadgen webhook error:', error);
      throw error;
    }
  }
  
  // Debug Facebook permissions and API access
  async debugPermissions(integration) {
    try {
      const debugInfo = {
        integration: {
          id: integration._id,
          connected: integration.connected,
          fbUserId: integration.fbUserId,
          fbUserName: integration.fbUserName,
          tokenExpiry: integration.tokenExpiresAt,
          pagesCount: integration.fbPages?.length || 0
        },
        permissions: {},
        pages: [],
        errors: []
      };

      // Test user token permissions
      try {
        const permissionsResponse = await axios.get(`${this.baseURL}/me/permissions`, {
          params: {
            access_token: integration.userAccessToken
          }
        });
        
        debugInfo.permissions.user = permissionsResponse.data.data.reduce((acc, perm) => {
          acc[perm.permission] = perm.status;
          return acc;
        }, {});
      } catch (error) {
        debugInfo.errors.push(`User permissions error: ${error.response?.data?.error?.message || error.message}`);
      }

      // Test each page
      for (const page of integration.fbPages || []) {
        const pageDebug = {
          id: page.id,
          name: page.name,
          hasAccessToken: !!page.accessToken,
          permissions: {},
          leadForms: [],
          errors: []
        };

        // Test page token permissions
        try {
          const pagePermissionsResponse = await axios.get(`${this.baseURL}/${page.id}`, {
            params: {
              access_token: page.accessToken,
              fields: 'id,name,access_token'
            }
          });
          pageDebug.permissions.page = { status: 'valid_token' };
        } catch (error) {
          pageDebug.errors.push(`Page permissions error: ${error.response?.data?.error?.message || error.message}`);
        }

        // Test lead forms access
        try {
          const formsResponse = await axios.get(`${this.baseURL}/${page.id}/leadgen_forms`, {
            params: {
              access_token: page.accessToken,
              fields: 'id,name,status,leads_count,created_time'
            }
          });
          
          pageDebug.leadForms = formsResponse.data.data.map(form => ({
            id: form.id,
            name: form.name,
            status: form.status,
            leadsCount: form.leads_count
          }));
        } catch (error) {
          const errorMessage = error.response?.data?.error?.message || error.message;
          pageDebug.errors.push(`Lead forms error: ${errorMessage}`);
          
          // Provide helpful guidance for common errors
          if (errorMessage.includes('pages_manage_ads')) {
            pageDebug.errors.push('SOLUTION: Your Facebook app needs pages_manage_ads permission and must be owned by a verified business. This is a Facebook requirement for accessing lead forms via API.');
          }
          if (errorMessage.includes('verified business')) {
            pageDebug.errors.push('SOLUTION: Submit your Facebook app for business verification at https://developers.facebook.com/');
          }
        }

        debugInfo.pages.push(pageDebug);
      }

      return debugInfo;
    } catch (error) {
      logger.error('Debug permissions error:', error.message);
      throw error;
    }
  }
}

module.exports = new FacebookService();
