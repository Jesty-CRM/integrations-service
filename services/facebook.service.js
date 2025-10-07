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
      
      logger.info('Starting Facebook OAuth token exchange...', { 
        userId, 
        organizationId,
        userIdType: typeof userId,
        organizationIdType: typeof organizationId
      });
      
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
      logger.info('Short-lived token obtained successfully');

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
      logger.info('Long-lived token obtained successfully');

      // Get user info
      const userResponse = await axios.get(`${this.baseURL}/me`, {
        params: {
          access_token: longLivedToken,
          fields: 'id,name,picture'
        }
      });

      logger.info('User info retrieved:', { userId: userResponse.data.id, userName: userResponse.data.name });

      try {
        // Save or update integration FIRST (without pages to avoid validation issues)
        logger.info('Saving Facebook integration...', { 
          userId, 
          organizationId, 
          userIdType: typeof userId,
          organizationIdType: typeof organizationId 
        });
        
        const integration = await FacebookIntegration.findOneAndUpdate(
          { organizationId },
          {
            id: `fb_${organizationId}_${Date.now()}`, // Generate unique integration ID
            userId: userId, // userId should be a string that gets converted to ObjectId by Mongoose
            organizationId: organizationId, // organizationId should be a string that gets converted to ObjectId by Mongoose
            connected: true,
            fbUserId: userResponse.data.id,
            fbUserName: userResponse.data.name,
            fbUserPicture: userResponse.data.picture?.data?.url || '',
            userAccessToken: longLivedToken,
            tokenExpiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
            lastSync: new Date(),
            fbPages: [], // Initialize empty, will be populated by sync
            settings: {
              autoProcessLeads: true,
              leadNotifications: true
            },
            stats: {
              leadsThisMonth: 0,
              leadsThisWeek: 0,
              leadsToday: 0
            }
          },
          { upsert: true, new: true }
        );

        logger.info('Integration saved successfully:', { 
          integrationId: integration._id, 
          id: integration.id,
          userId: integration.userId,
          organizationId: integration.organizationId,
          hasUserId: !!integration.userId
        });

        // Now fetch and save pages with forms immediately
        logger.info('Fetching Facebook pages and forms after OAuth...');
        try {
          const updatedIntegration = await this.syncPages(integration);
          logger.info('Pages and forms synced successfully after OAuth:', {
            pagesCount: updatedIntegration.fbPages.length,
            totalForms: updatedIntegration.fbPages.reduce((total, page) => total + (page.leadForms?.length || 0), 0)
          });
          return updatedIntegration;
        } catch (syncError) {
          logger.error('Error syncing pages during OAuth:', {
            message: syncError.message,
            stack: syncError.stack,
            response: syncError.response?.data
          });
          // Return the integration even if sync fails - user can sync manually later
          return integration;
        }
      } catch (saveError) {
        logger.error('Error saving Facebook integration:', {
          message: saveError.message,
          stack: saveError.stack,
          validationErrors: saveError.errors
        });
        throw new Error(`Failed to save Facebook integration: ${saveError.message}`);
      }
    } catch (error) {
      logger.error('Facebook OAuth error:', {
        message: error.message,
        stack: error.stack,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      });
      throw new Error(`Failed to connect Facebook account: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  // Sync pages from Facebook with auto-update
  async syncPages(integration) {
    try {
      if (!integration.userAccessToken) {
        throw new Error('No access token available');
      }

      logger.info('Starting Facebook pages sync...');

      // Get user's pages
      const pagesResponse = await axios.get(`${this.baseURL}/me/accounts`, {
        params: {
          access_token: integration.userAccessToken,
          fields: 'id,name,picture,access_token'
        }
      });

      logger.info(`Found ${pagesResponse.data.data?.length || 0} pages to sync`);

      // Process pages with detailed lead forms information and preserve existing settings
      const pages = await Promise.all(pagesResponse.data.data.map(async (page) => {
        try {
          logger.info(`Processing page: ${page.name} (${page.id})`);
          
          // Try detailed method first, fallback to simple if it fails
          let leadForms;
          try {
            leadForms = await this.getPageLeadFormsDetailed(page.access_token, page.id);
            logger.info(`Detailed forms data for page ${page.id}:`, {
              formsCount: leadForms.length,
              firstForm: leadForms[0] ? {
                id: leadForms[0].id,
                name: leadForms[0].name,
                questionsCount: leadForms[0].questions?.length || 0,
                firstQuestion: leadForms[0].questions?.[0] ? {
                  structure: Object.keys(leadForms[0].questions[0]),
                  hasId: !!leadForms[0].questions[0].id,
                  hasKey: !!leadForms[0].questions[0].key
                } : null
              } : null
            });
          } catch (detailedError) {
            logger.warn(`Detailed forms fetch failed for page ${page.id}, falling back to simple method:`, detailedError.message);
            leadForms = await this.getPageLeadFormsSimple(page.access_token, page.id);
          }
          
          logger.info(`Found ${leadForms.length} forms for page ${page.name}`);
          
          // Find existing page data to preserve form settings
          const existingPage = integration.fbPages.find(p => p.id === page.id);
          
          // Merge new lead forms data with existing settings
          const processedLeadForms = leadForms.map(form => {
            const existingForm = existingPage?.leadForms?.find(f => f.id === form.id);
            
            return {
              id: String(form.id),
              name: String(form.name || 'Unnamed Form'),
              status: String(form.status || 'ACTIVE'),
              leadsCount: parseInt(form.leadsCount) || 0,
              createdTime: String(form.createdTime || new Date().toISOString()),
              enabled: Boolean(existingForm?.enabled !== undefined ? existingForm.enabled : true),
              questions: [], // Temporarily disable questions to avoid validation errors
              assignmentSettings: {
                enabled: Boolean(existingForm?.assignmentSettings?.enabled || false),
                algorithm: String(existingForm?.assignmentSettings?.algorithm || 'round-robin'),
                assignToUsers: Array.isArray(existingForm?.assignmentSettings?.assignToUsers) ? existingForm.assignmentSettings.assignToUsers : [],
                lastAssignment: {
                  mode: String(existingForm?.assignmentSettings?.lastAssignment?.mode || 'manual'),
                  lastAssignedIndex: parseInt(existingForm?.assignmentSettings?.lastAssignment?.lastAssignedIndex) || 0,
                  lastAssignedAt: existingForm?.assignmentSettings?.lastAssignment?.lastAssignedAt || null,
                  lastAssignedTo: existingForm?.assignmentSettings?.lastAssignment?.lastAssignedTo || null
                }
              },
              stats: {
                leadsThisMonth: parseInt(existingForm?.stats?.leadsThisMonth) || 0,
                leadsThisWeek: parseInt(existingForm?.stats?.leadsThisWeek) || 0,
                leadsToday: parseInt(existingForm?.stats?.leadsToday) || 0,
                lastLeadReceived: existingForm?.stats?.lastLeadReceived || null
              }
            };
          });
          
          return {
            id: page.id,
            name: page.name,
            accessToken: page.access_token,
            lastSyncAt: new Date(),
            leadForms: processedLeadForms
          };
        } catch (error) {
          logger.error(`Error fetching lead forms for page ${page.id}:`, {
            message: error.message,
            responseData: error.response?.data,
            responseStatus: error.response?.status
          });
          // Return existing page data if sync fails
          const existingPage = integration.fbPages.find(p => p.id === page.id);
          return existingPage || {
            id: page.id,
            name: page.name,
            accessToken: page.access_token,
            lastSyncAt: new Date(),
            leadForms: []
          };
        }
      }));

      logger.info('Saving updated pages to database...');

      try {
        // Log data structure before save
        logger.info('Pages to save:', {
          count: pages.length,
          firstPageStructure: pages.length > 0 ? {
            id: pages[0].id,
            name: pages[0].name,
            leadFormsCount: pages[0].leadForms?.length,
            hasAccessToken: !!pages[0].accessToken
          } : null
        });

        // Update integration with new pages
        integration.fbPages = pages;
        integration.lastSync = new Date();
        integration.updatedAt = new Date();
        
        // Ensure required fields are set
        if (!integration.organizationId) {
          logger.error('OrganizationId is missing from integration, cannot save');
          throw new Error('Integration missing required organizationId field');
        }
        
        // Save with validation
        const savedIntegration = await integration.save();
        
        logger.info('Pages sync completed successfully');
        return pages;
      } catch (saveError) {
        logger.error('Database save error:', {
          name: saveError.name,
          message: saveError.message,
          errors: saveError.errors,
          validationErrors: saveError.name === 'ValidationError' ? Object.keys(saveError.errors || {}) : null,
          fullValidationDetails: saveError.name === 'ValidationError' ? saveError.errors : null
        });
        
        // Log each validation error separately for better visibility
        if (saveError.name === 'ValidationError' && saveError.errors) {
          Object.keys(saveError.errors).forEach(field => {
            logger.error(`Validation error for field ${field}:`, saveError.errors[field].message);
          });
        }
        
        // Try to save without the problematic data
        try {
          logger.info('Attempting to save with basic page data only...');
          
          const basicPages = pages.map(page => ({
            id: String(page.id),
            name: String(page.name || 'Unnamed Page'),
            accessToken: String(page.accessToken || ''),
            lastSyncAt: new Date(),
            leadForms: (page.leadForms || []).map(form => {
              const cleanForm = {
                id: String(form.id),
                name: String(form.name || 'Unnamed Form'),
                status: String(form.status || 'ACTIVE'),
                leadsCount: parseInt(form.leadsCount) || 0,
                createdTime: form.createdTime ? new Date(form.createdTime) : new Date(),
                enabled: Boolean(form.enabled !== false),
                questions: [], // Disable questions in fallback to avoid validation
                assignmentSettings: {
                  enabled: false,
                  algorithm: 'round-robin',
                  assignToUsers: [],
                  lastAssignment: {
                    mode: 'manual',
                    lastAssignedIndex: 0,
                    lastAssignedAt: null,
                    lastAssignedTo: null
                  }
                },
                stats: {
                  leadsThisMonth: 0,
                  leadsThisWeek: 0,
                  leadsToday: 0,
                  lastLeadReceived: null
                }
              };
              
              logger.info('Cleaned form structure:', {
                id: cleanForm.id,
                name: cleanForm.name,
                questionsCount: cleanForm.questions.length,
                hasValidFields: !!(cleanForm.id && cleanForm.name)
              });
              
              return cleanForm;
            })
          }));
          
          logger.info('Basic pages structure created:', {
            count: basicPages.length,
            totalForms: basicPages.reduce((sum, page) => sum + page.leadForms.length, 0)
          });
          
          integration.fbPages = basicPages;
          await integration.save();
          
          logger.info('Successfully saved with basic page data');
          return basicPages;
        } catch (fallbackError) {
          logger.error('Fallback save also failed:', {
            name: fallbackError.name,
            message: fallbackError.message,
            errors: fallbackError.errors,
            validationErrors: fallbackError.name === 'ValidationError' ? Object.keys(fallbackError.errors || {}) : null,
            fullValidationDetails: fallbackError.name === 'ValidationError' ? fallbackError.errors : null
          });
          
          // Log each validation error separately for better visibility
          if (fallbackError.name === 'ValidationError' && fallbackError.errors) {
            Object.keys(fallbackError.errors).forEach(field => {
              logger.error(`Fallback validation error for field ${field}:`, fallbackError.errors[field].message);
            });
          }
          
          // Last resort: try saving with absolutely minimal data
          try {
            logger.error('Attempting last resort save with minimal data...');
            
            // Reset to minimal structure but keep the forms
            integration.fbPages = pages.map(page => ({
              id: String(page.id),
              name: String(page.name || 'Unnamed Page'),
              accessToken: String(page.accessToken || ''),
              lastSyncAt: new Date(),
              leadForms: (page.leadForms || []).map(form => ({
                id: String(form.id),
                name: String(form.name || 'Unnamed Form'),
                status: String(form.status || 'ACTIVE'),
                leadsCount: parseInt(form.leadsCount) || 0,
                createdTime: form.createdTime ? String(form.createdTime) : new Date().toISOString(),
                enabled: true,
                questions: [],
                assignmentSettings: {
                  enabled: false,
                  algorithm: 'round-robin',
                  assignToUsers: [],
                  lastAssignment: {
                    mode: 'manual',
                    lastAssignedIndex: 0,
                    lastAssignedAt: null,
                    lastAssignedTo: null
                  }
                },
                stats: {
                  leadsThisMonth: 0,
                  leadsThisWeek: 0,
                  leadsToday: 0,
                  lastLeadReceived: null
                }
              }))
            }));
            
            await integration.save();
            logger.info('Last resort save successful - pages saved without forms');
            return integration.fbPages;
          } catch (lastError) {
            logger.error('Even minimal save failed:', {
              name: lastError.name,
              message: lastError.message,
              errors: lastError.errors
            });
            throw saveError; // Throw original error
          }
        }
      }
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

  // Process leadgen webhook - ALL leads go through FacebookLeadProcessor for assignment
  async processLeadgenWebhook(value) {
    try {
      const { leadgen_id, page_id, form_id } = value;
      logger.info('Processing leadgen webhook for:', { leadgen_id, page_id, form_id });

      // Use the FacebookLeadProcessor service for ALL leads (test and real)
      const facebookLeadProcessor = require('./facebookLeadProcessor.service');
      
      const webhookData = {
        leadgen_id,
        page_id,
        form_id
      };
      
      // Process through FacebookLeadProcessor which handles both lead creation AND assignment
      logger.info('Processing Facebook leads through FacebookLeadProcessor for assignment support');
      const result = await facebookLeadProcessor.processWebhookLead(webhookData);
      
      logger.info('Facebook webhook lead processed via FacebookLeadProcessor:', {
        leadgenId: leadgen_id,
        success: result?.success,
        leadId: result?.leadId,
        assigned: result?.assigned,
        assignedTo: result?.assignedTo
      });

      return result;

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

  // Get lead forms with basic info for OAuth (simpler, more reliable)
  async getPageLeadFormsSimple(pageAccessToken, pageId) {
    try {
      // Fetch lead forms with basic fields only
      const formsResponse = await axios.get(`${this.baseURL}/${pageId}/leadgen_forms`, {
        params: {
          access_token: pageAccessToken,
          fields: 'id,name,status,leads_count,created_time'
        }
      });

      const forms = formsResponse.data.data || [];
      
      // Return forms with basic info only for OAuth
      return forms.map(form => ({
        id: form.id,
        name: form.name,
        status: form.status,
        leadsCount: form.leads_count || 0,
        createdTime: form.created_time,
        questions: [] // Will be fetched later during sync
      }));
    } catch (error) {
      logger.error(`Error fetching basic lead forms for page ${pageId}:`, error.message);
      return [];
    }
  }

  // Get detailed form information including questions for sync
  async getPageLeadFormsDetailed(pageAccessToken, pageId) {
    try {
      logger.info(`Fetching lead forms for page ${pageId}...`);
      
      // Fetch lead forms
      const formsResponse = await axios.get(`${this.baseURL}/${pageId}/leadgen_forms`, {
        params: {
          access_token: pageAccessToken,
          fields: 'id,name,status,leads_count,created_time'
        }
      });

      const forms = formsResponse.data.data || [];
      logger.info(`Found ${forms.length} forms for page ${pageId}`);
      
      // Get detailed questions for each form
      const detailedForms = await Promise.all(
        forms.map(async (form) => {
          try {
            logger.info(`Fetching questions for form ${form.name} (${form.id})`);
            
            const questionsResponse = await axios.get(`${this.baseURL}/${form.id}`, {
              params: {
                access_token: pageAccessToken,
                fields: 'questions'
              }
            });

            const questions = (questionsResponse.data.questions || []).map(q => ({
              id: q.id,
              key: q.key,
              label: q.label,
              type: q.type,
              options: q.options || []
            }));

            logger.info(`Found ${questions.length} questions for form ${form.name}`);

            return {
              id: form.id,
              name: form.name,
              status: form.status,
              leadsCount: form.leads_count || 0,
              createdTime: form.created_time,
              questions: questions
            };
          } catch (error) {
            logger.error(`Error fetching questions for form ${form.id}:`, {
              message: error.message,
              responseData: error.response?.data,
              responseStatus: error.response?.status
            });
            return {
              id: form.id,
              name: form.name,
              status: form.status,
              leadsCount: form.leads_count || 0,
              createdTime: form.created_time,
              questions: []
            };
          }
        })
      );

      return detailedForms;
    } catch (error) {
      logger.error(`Error fetching lead forms for page ${pageId}:`, {
        message: error.message,
        responseData: error.response?.data,
        responseStatus: error.response?.status
      });
      return [];
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
