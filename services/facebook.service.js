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

      // Process pages (simplified like old Jesty backend - no leadForms storage)
      const pages = pagesResponse.data.data.map(page => ({
        id: page.id,
        name: page.name,
        accessToken: page.access_token
      }));

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

      // Process pages (simplified like old Jesty backend)
      const pages = pagesResponse.data.data.map(page => ({
        id: page.id,
        name: page.name,
        accessToken: page.access_token
      }));

      // Update integration with new pages
      integration.fbPages = pages;
      integration.updatedAt = new Date();
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
      // Use the Facebook-specific import endpoint that doesn't require auth
      const response = await axios.post(`${process.env.LEADS_SERVICE_URL}/api/facebook-leads/import/facebook`, {
        ...leadData,
        organizationId: companyId  // Use organizationId instead of companyId
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return response.data;

    } catch (error) {
      logger.error('Create/update lead error:', error.response?.data || error.message);
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
      logger.info('Processing Facebook webhook payload:', JSON.stringify(payload, null, 2));
      
      // Process Facebook webhook payload
      if (payload.object === 'page') {
        for (const entry of payload.entry) {
          if (entry.changes) {
            for (const change of entry.changes) {
              if (change.field === 'leadgen') {
                logger.info('Processing leadgen webhook:', change.value);
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
      logger.info('Processing leadgen webhook for:', { leadgen_id, page_id, form_id });

      // Find integration by page_id using FacebookIntegration model
      const FacebookIntegration = require('../models/FacebookIntegration');
      const integration = await FacebookIntegration.findOne({
        'fbPages.id': page_id,
        connected: true
      });

      if (!integration) {
        logger.warn('No active Facebook integration found for page:', page_id);
        return;
      }

      logger.info('Found integration:', integration._id);

      // Find the specific page
      const page = integration.fbPages.find(p => p.id === page_id);
      if (!page) {
        logger.warn('Page not found in integration:', page_id);
        return;
      }

      logger.info('Found page:', { id: page.id, name: page.name });

      // For test webhook, skip API call and create dummy lead
      if (leadgen_id === 'test_lead_123' || leadgen_id === 'test_lead_with_custom_fields') {
        logger.info('Processing test webhook - creating dummy lead with custom fields');
        const testLead = {
          id: leadgen_id,
          created_time: new Date().toISOString(),
          field_data: [
            { name: 'full_name', values: ['Test User'] },
            { name: 'email', values: ['test@example.com'] },
            { name: 'phone_number', values: ['+1234567890'] },
            { name: 'have_you_tried_any_treatment_before?', values: ['Yes'] },
            { name: 'your_concern', values: ['pigmentation'] }
          ],
          form_id: form_id
        };
        
        const transformedLead = this.transformFacebookLead(testLead, { id: form_id }, page_id);
        
        // Debug the transformed lead data
        logger.info('Transformed lead data:', JSON.stringify(transformedLead, null, 2));
        
        await this.createOrUpdateLead(transformedLead, integration.organizationId);
        logger.info('Test webhook lead with custom fields processed:', leadgen_id);
        return;
      }

      // Get lead details from Facebook API
      const response = await axios.get(`${this.baseURL}/${leadgen_id}`, {
        params: {
          access_token: page.accessToken,
          fields: 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id'
        }
      });

      const lead = response.data;
      
      // Debug the raw Facebook lead data
      logger.info('Raw Facebook lead data:', JSON.stringify(lead, null, 2));
      
      // Transform and create lead
      const transformedLead = this.transformFacebookLead(lead, { id: form_id }, page_id);
      
      // Debug the transformed lead data
      logger.info('Transformed lead data:', JSON.stringify(transformedLead, null, 2));
      
      await this.createOrUpdateLead(transformedLead, integration.organizationId);

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

  // Get detailed form information including questions
  async getFormDetails(integration, pageId, formId) {
    try {
      const page = integration.fbPages.find(p => p.id === pageId);
      if (!page) {
        throw new Error('Page not found in integration');
      }

      // Get detailed form information
      const response = await axios.get(`${this.baseURL}/${formId}`, {
        params: {
          access_token: page.accessToken,
          fields: 'id,name,status,leads_count,created_time,questions,privacy_policy_url,context_card'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error fetching form details:', formId, 'Error:', error.response?.data || error.message);
      throw new Error(`Failed to fetch form details: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

module.exports = new FacebookService();
