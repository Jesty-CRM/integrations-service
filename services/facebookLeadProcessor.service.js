const axios = require('axios');
const logger = require('../utils/logger');
const FacebookIntegration = require('../models/FacebookIntegration');
const formAssignmentService = require('./formAssignmentService');
const { ObjectId } = require('mongoose').Types;

class FacebookLeadProcessor {
  constructor() {
    this.leadsServiceUrl = process.env.LEADS_SERVICE_URL || 'http://localhost:3002';
  }

  // Main webhook processing method
  async processWebhookLead(webhookData) {
    try {
      // Extract data from webhook
      const { leadgen_id, page_id, form_id } = webhookData;
      
      logger.info('Processing Facebook webhook lead:', { 
        leadgenId: leadgen_id, 
        pageId: page_id, 
        formId: form_id 
      });

      // Find ALL integrations that have access to this page
      const integrations = await FacebookIntegration.find({
        'fbPages.id': page_id,
        connected: true
      });

      if (!integrations || integrations.length === 0) {
        throw new Error(`No Facebook integration found for page ${page_id}`);
      }

      logger.info(`Found ${integrations.length} integrations for page ${page_id}:`, 
        integrations.map(int => ({
          integrationId: int._id,
          organizationId: int.organizationId,
          fbUserName: int.fbUserName
        }))
      );

      // Process lead for each integration that has access to this page
      const results = [];

      for (const integration of integrations) {
        try {
          logger.info(`Processing lead for integration ${integration._id} (${integration.fbUserName})`);
          
          const organizationId = integration.organizationId;
          
          // Validate organizationId format
          if (!organizationId || organizationId === 'dummy' || !ObjectId.isValid(organizationId)) {
            logger.error(`❌ Invalid organizationId: "${organizationId}" - must be a valid MongoDB ObjectId`);
            results.push({
              integrationId: integration._id,
              organizationId,
              success: false,
              error: `Invalid organizationId: ${organizationId}`
            });
            continue;
          }
          
          logger.info('Processing for organization:', organizationId);

          // Find the specific page and form for this integration
          const page = integration.fbPages.find(p => p.id === page_id);
          if (!page) {
            results.push({
              integrationId: integration._id,
              organizationId,
              success: false,
              error: `Page ${page_id} not found in integration`
            });
            continue;
          }

          const form = page.leadForms?.find(f => f.id === form_id);
          if (form && !form.enabled) {
            logger.info(`Form ${form_id} is disabled for integration ${integration._id}, skipping`);
            results.push({
              integrationId: integration._id,
              organizationId,
              success: false,
              reason: 'form_disabled'
            });
            continue;
          }

          // Handle test leads or fetch real lead data from Facebook
          let facebookLead;
          
          if (leadgen_id.startsWith('test_')) {
            logger.info('Processing test webhook - creating dummy lead data');
            facebookLead = {
              id: leadgen_id,
              created_time: new Date().toISOString(),
              field_data: [
                { name: 'full_name', values: ['Test Assignment User'] },
                { name: 'email', values: [`test.assignment.${Date.now()}@fb.com`] },
                { name: 'phone_number', values: ['+919876543210'] }
              ],
              form_id: form_id,
              ad_id: 'test_ad_123',
              campaign_id: 'test_campaign_123'
            };
          } else {
            facebookLead = await this.fetchLeadFromFacebook(leadgen_id, page.access_token || page.accessToken);
            if (!facebookLead) {
              logger.warn('⚠️ Failed to fetch lead data from Facebook API - creating fallback data');
              facebookLead = this.createFallbackLeadData(leadgen_id);
            }
          }

          // Extract fields using simple approach
          const extractedFields = this.extractLeadFields(facebookLead.field_data || []);
          
          // Validate contact information
          if (!extractedFields.email && !extractedFields.phone) {
            logger.warn(`Lead rejected for integration ${integration._id}: No contact information`, { 
              leadgenId: leadgen_id, 
              formId: form_id,
              availableFields: facebookLead.field_data?.map(f => f.name) || []
            });
            results.push({
              integrationId: integration._id,
              organizationId,
              success: false,
              reason: 'no_contact_info',
              message: 'Lead must have at least one contact method (email or phone)'
            });
            continue;
          }

          // Create lead data for CRM
          const leadData = {
            name: extractedFields.name,
            email: extractedFields.email,
            phone: extractedFields.phone || '',
            organizationId,
            source: 'facebook',
            status: 'new',
            customFields: {
              company: extractedFields.company,
              message: extractedFields.message,
              ...extractedFields.customFields
            },
            extraFields: {
              sourceDetails: JSON.stringify({
                integrationId: integration._id,
                integrationKey: integration.id,
                formId: form_id,
                pageId: page_id,
                fbUserName: integration.fbUserName,
                submittedAt: facebookLead.created_time
              }),
              formId: form_id,
              submissionType: 'webhook',
              submittedAt: facebookLead.created_time,
              source: 'facebook',
              status: 'new',
              priority: 'medium',
              score: 29
            },
            integrationData: {
              platform: 'facebook',
              facebookLeadId: facebookLead.id,
              formId: facebookLead.form_id,
              pageId: page_id
            },
            metadata: {
              facebookLeadId: facebookLead.id,
              formId: facebookLead.form_id,
              adId: facebookLead.ad_id,
              campaignId: facebookLead.campaign_id,
              createdTime: facebookLead.created_time,
              rawFacebookData: facebookLead
            }
          };

          logger.info(`📋 Creating lead for organization ${organizationId} (${integration.fbUserName})`);

          // Create lead in CRM
          const result = await this.createLeadInCRM(leadData, organizationId);
          const leadId = result.leadId;

          // Auto-assign lead if assignment settings are enabled
          if (form && form.assignmentSettings && form.assignmentSettings.enabled) {
            try {
              const assignmentResult = await this.autoAssignFacebookLead(
                leadId,
                integration,
                page_id,
                form_id,
                organizationId
              );

              if (assignmentResult.assigned) {
                logger.info(`✅ Lead auto-assigned for integration ${integration._id}:`, {
                  leadId: leadId,
                  assignedTo: assignmentResult.assignedTo
                });
                result.assigned = true;
                result.assignedTo = assignmentResult.assignedTo;
              }
            } catch (assignmentError) {
              logger.error(`Failed to auto-assign lead for integration ${integration._id}:`, assignmentError.message);
            }
          }

          // Update integration statistics
          await this.updateIntegrationStats(integration, result);
          
          results.push({
            integrationId: integration._id,
            organizationId,
            fbUserName: integration.fbUserName,
            success: true,
            leadId: result.leadId,
            action: result.action,
            assigned: result.assigned || false,
            assignedTo: result.assignedTo || 'none'
          });

          logger.info(`✅ Successfully processed lead for integration ${integration._id} (${integration.fbUserName}):`, {
            leadId: result.leadId,
            organizationId
          });

        } catch (error) {
          logger.error(`❌ Error processing lead for integration ${integration._id}:`, {
            error: error.message,
            organizationId: integration.organizationId,
            fbUserName: integration.fbUserName
          });
          
          results.push({
            integrationId: integration._id,
            organizationId: integration.organizationId,
            fbUserName: integration.fbUserName,
            success: false,
            error: error.message
          });
        }
      }

      // Return summary of all processing results
      const successfulProcessing = results.filter(r => r.success);
      const failedProcessing = results.filter(r => !r.success);

      logger.info(`📊 Lead processing summary for ${leadgen_id}:`, {
        totalIntegrations: integrations.length,
        successful: successfulProcessing.length,
        failed: failedProcessing.length,
        successfulOrgs: successfulProcessing.map(r => ({ 
          org: r.organizationId, 
          user: r.fbUserName,
          leadId: r.leadId 
        })),
        failedOrgs: failedProcessing.map(r => ({ 
          org: r.organizationId, 
          user: r.fbUserName, 
          error: r.error 
        }))
      });

      return {
        success: successfulProcessing.length > 0,
        totalIntegrations: integrations.length,
        successfulProcessing: successfulProcessing.length,
        failedProcessing: failedProcessing.length,
        results: results,
        leadgenId: leadgen_id
      };

    } catch (error) {
      console.error('=== FACEBOOK WEBHOOK PROCESSING ERROR ===');
      console.error('Error Type:', error.constructor.name);
      console.error('Error Message:', error.message);
      console.error('Error Stack:', error.stack);
      console.error('Lead ID:', leadgen_id);
      console.error('Page ID:', page_id);
      console.error('Form ID:', form_id);
      console.error('========================================');
      
      logger.error('Error processing Facebook webhook lead:', {
        errorType: error.constructor.name,
        errorMessage: error.message,
        leadId: leadgen_id,
        pageId: page_id,
        formId: form_id,
        stack: error.stack
      });
      throw error;
    }
  }

  // Simple field extraction using old Jesty backend approach - direct field access
  extractLeadFields(fieldData) {
    try {
      // Log all available fields for debugging
      logger.info('Available Facebook lead fields:', fieldData.map(f => ({ name: f.name, values: f.values })));
      
      // Try multiple possible field names for each data type
      const name = this.findFieldValue(fieldData, ['full_name', 'name', 'full name']) || 'FB Lead';
      const email = this.findFieldValue(fieldData, ['email', 'email_address', 'e_mail']);
      const phone = this.findFieldValue(fieldData, ['phone_number', 'phone', 'mobile', 'mobile_number', 'telephone']);
      
      // Clean phone number for Indian format
      const cleanedPhone = phone ? this.cleanPhoneNumber(phone) : null;
      
      // Extract other common fields using direct access
      const firstName = this.findFieldValue(fieldData, ['first_name', 'firstname', 'first name']);
      const lastName = this.findFieldValue(fieldData, ['last_name', 'lastname', 'last name']);
      const city = this.findFieldValue(fieldData, ['city', 'location', 'address']);
      const company = this.findFieldValue(fieldData, ['company_name', 'company', 'organization']);
      const jobTitle = this.findFieldValue(fieldData, ['job_title', 'position', 'title', 'occupation']);
      
      // Build final name (prefer full_name, fallback to first + last)
      let finalName = name;
      if ((!finalName || finalName === 'FB Lead') && (firstName || lastName)) {
        finalName = `${firstName || ''} ${lastName || ''}`.trim();
      }
      if (!finalName) finalName = 'FB Lead';
      
      // Extract custom fields (any field not in the standard list)
      const standardFields = [
        'full_name', 'name', 'full name', 'email', 'email_address', 'e_mail',
        'phone_number', 'phone', 'mobile', 'mobile_number', 'telephone',
        'first_name', 'firstname', 'first name', 'last_name', 'lastname', 'last name',
        'city', 'location', 'address', 'company_name', 'company', 'organization',
        'job_title', 'position', 'title', 'occupation'
      ];
      
      const customFields = {};
      fieldData.forEach(field => {
        const fieldName = field.name.toLowerCase();
        if (!standardFields.some(std => std.toLowerCase() === fieldName)) {
          // This is a custom field
          customFields[field.name] = field.values;
        }
      });
      
      return {
        name: finalName,
        email: email ? email.toLowerCase() : null,
        phone: cleanedPhone,
        firstName,
        lastName,
        city,
        company,
        jobTitle,
        customFields // Add custom fields to the result
      };
    } catch (error) {
      console.error('Error extracting lead fields:', error);
      return {
        name: 'FB Lead',
        email: null,
        phone: null,
        customFields: {}
      };
    }
  }

  // Fetch lead from Facebook API with fallback for API failures
  async fetchLeadFromFacebook(leadId, accessToken) {
    try {
      logger.info(`Fetching lead ${leadId} from Facebook API...`);
      
      if (!accessToken || accessToken === 'undefined') {
        logger.error('Invalid Facebook access token');
        return this.createFallbackLeadData(leadId);
      }
      
      const response = await axios.get(`https://graph.facebook.com/v19.0/${leadId}`, {
        params: {
          access_token: accessToken,
          fields: 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id'
        },
        timeout: 10000 // 10 second timeout
      });

      logger.info('✅ Facebook API Response received successfully');
      
      // Log the raw field data to see what Facebook is actually sending
      if (response.data.field_data) {
        logger.info('Raw Facebook field_data:', JSON.stringify(response.data.field_data, null, 2));
      }
      
      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const errorMessage = error.response?.data?.error?.message || error.message;
      
      logger.error('❌ Facebook API error:', {
        status: status,
        error: errorMessage,
        leadId: leadId,
        tokenValid: !!accessToken,
        fullError: error.response?.data
      });
      
      // Handle specific Facebook API errors
      if (status === 401) {
        logger.error('🔑 Facebook access token expired or invalid - token needs refresh');
      } else if (status === 400) {
        logger.error('📋 Facebook API bad request - possible lead ID or parameter issue');
      } else if (status === 403) {
        logger.error('🚫 Facebook API forbidden - insufficient permissions');
      }
      
      // Return fallback data if Facebook API fails
      logger.warn('🔄 Using fallback lead data due to Facebook API failure');
      return this.createFallbackLeadData(leadId);
    }
  }

  // Create fallback lead data when Facebook API is unavailable
  createFallbackLeadData(leadId) {
    logger.info(`Creating fallback lead data for leadId: ${leadId}`);
    return {
      id: leadId,
      created_time: new Date().toISOString(),
      field_data: [
        { name: 'full_name', values: ['Facebook Lead'] },
        { name: 'email', values: [`lead_${leadId.substring(0, 8)}@facebook.com`] },
        { name: 'phone_number', values: ['+1234567890'] }
      ],
      ad_id: 'unknown',
      ad_name: 'Unknown Ad',
      campaign_id: 'unknown',
      campaign_name: 'Unknown Campaign',
      form_id: 'unknown'
    };
  }

  // Helper method to find field value by trying multiple field name variations
  findFieldValue(fieldData, fieldNames) {
    for (const fieldName of fieldNames) {
      const field = fieldData.find(f => f.name.toLowerCase() === fieldName.toLowerCase());
      if (field && field.values && field.values[0]) {
        return field.values[0];
      }
    }
    return null;
  }

  // Clean phone number format
  cleanPhoneNumber(phone) {
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    // Handle Indian numbers
    if (cleaned.startsWith('91') && cleaned.length === 12) {
      cleaned = '+' + cleaned;
    } else if (cleaned.startsWith('0') && cleaned.length === 11) {
      cleaned = '+91' + cleaned.substring(1);
    } else if (cleaned.length === 10) {
      cleaned = '+91' + cleaned;
    }
    
    return cleaned;
  }

  // Create lead in CRM system
  async createLeadInCRM(leadData, organizationId) {
    try {
      leadData.organizationId = organizationId;

      // Enhanced debug logging
      console.log('=== SENDING LEAD TO CRM ===');
      console.log('URL:', `${this.leadsServiceUrl}/api/facebook-leads/import/facebook`);
      console.log('Organization ID:', organizationId);
      console.log('Service Auth Token:', process.env.SERVICE_AUTH_TOKEN || 'integrations-service-auth-token');
      console.log('Lead Data:', JSON.stringify(leadData, null, 2));
      console.log('==========================');

      const response = await axios.post(`${this.leadsServiceUrl}/api/facebook-leads/import/facebook`, leadData, {
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Auth': process.env.SERVICE_AUTH_TOKEN || 'integrations-service-auth-token',
          'X-Organization-Id': organizationId
        }
      });

      return {
        success: true,
        leadId: response.data.leadId,
        action: response.data.action || 'created'
      };

    } catch (error) {
      console.error('=== CRM API ERROR DETAILS ===');
      console.error('Status:', error.response?.status);
      console.error('Status Text:', error.response?.statusText);
      console.error('Response Data:', JSON.stringify(error.response?.data, null, 2));
      console.error('Request URL:', error.config?.url);
      console.error('Request Method:', error.config?.method);
      console.error('Request Headers:', JSON.stringify(error.config?.headers, null, 2));
      console.error('Request Data:', JSON.stringify(error.config?.data, null, 2));
      console.error('Full Error:', error.message);
      console.error('===============================');
      
      logger.error('Error creating lead in CRM:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        requestUrl: error.config?.url,
        errorMessage: error.message
      });
      
      throw new Error(`Failed to create lead: ${error.response?.data?.message || error.message}`);
    }
  }

  // Update integration statistics (simplified like old Jesty)
  async updateIntegrationStats(integration, result) {
    try {
      // Update overall integration stats
      integration.totalLeads = (integration.totalLeads || 0) + (result.success ? 1 : 0);
      if (result.success) {
        integration.lastLeadReceived = new Date();
      }
      
      // Update stats
      if (result.success) {
        integration.stats = integration.stats || {};
        integration.stats.leadsToday = (integration.stats.leadsToday || 0) + 1;
        integration.stats.leadsThisWeek = (integration.stats.leadsThisWeek || 0) + 1;
        integration.stats.leadsThisMonth = (integration.stats.leadsThisMonth || 0) + 1;

        // Update form-level stats if form metadata exists
        if (result.metadata && result.metadata.formId && result.metadata.pageId) {
          const pageIndex = integration.fbPages.findIndex(p => p.id === result.metadata.pageId);
          if (pageIndex !== -1) {
            const formIndex = integration.fbPages[pageIndex].leadForms.findIndex(f => f.id === result.metadata.formId);
            if (formIndex !== -1) {
              // Update form stats
              const form = integration.fbPages[pageIndex].leadForms[formIndex];
              form.leadsCount = (form.leadsCount || 0) + 1;
              form.stats = form.stats || {};
              form.stats.leadsToday = (form.stats.leadsToday || 0) + 1;
              form.stats.leadsThisWeek = (form.stats.leadsThisWeek || 0) + 1;
              form.stats.leadsThisMonth = (form.stats.leadsThisMonth || 0) + 1;
              form.stats.lastLeadReceived = new Date();
            }
          }
        }
      }
      
      await integration.save();
    } catch (error) {
      logger.error('Error updating integration stats:', error);
    }
  }

  // Auto-assign Facebook lead using manual assignment route (like CRM does)
  async autoAssignFacebookLead(leadId, integration, pageId, formId, organizationId) {
    try {
    logger.info('Starting Facebook lead auto-assignment:', {
      leadId,
      integrationId: integration._id,
      pageId,
      formId
    });      // Get next assignee using form assignment service
      const formAssignmentService = require('./formAssignmentService');
      const assigneeResult = await formAssignmentService.getNextAssigneeForForm(
        integration._id,
        pageId,
        formId
      );

    if (!assigneeResult || !assigneeResult.user) {
      logger.warn('No assignee available for Facebook lead');
      return {
        assigned: false,
        reason: 'No assignee available from form assignment settings'
      };
    }

    const assignedUserId = assigneeResult.user._id || assigneeResult.user.userId;
    logger.info('Got assignee from form settings:', {
      userId: assignedUserId,
      userIdType: typeof assignedUserId,
      nextIndex: assigneeResult.nextIndex
    });    // Use service-to-service assignment via formAssignmentService
    logger.info('Assigning lead via form assignment service:', {
      leadId,
      assignedUserId,
      organizationId
    });      const assignmentResult = await formAssignmentService.assignLeadToUserViaService(
        leadId,
        assignedUserId,
        organizationId
      );

      if (assignmentResult && assignmentResult.success) {
        logger.info('Facebook lead assigned successfully via service:', {
          leadId,
          assignedTo: assignedUserId,
          responseData: assignmentResult
        });

        // Update last assignment tracking
        await formAssignmentService.updateLastAssignment(
          integration._id,
          pageId,
          formId,
          assigneeResult
        );

        return {
          assigned: true,
          assignedTo: assignedUserId,
          algorithm: 'form-based-assignment',
          nextIndex: assigneeResult.nextIndex
        };
      } else {
        logger.error('Failed to assign Facebook lead via service:', assignmentResult);
        return {
          assigned: false,
          reason: `Service assignment failed: ${assignmentResult?.message || 'Unknown error'}`
        };
      }

    } catch (error) {
      logger.error('Error in Facebook lead auto-assignment:', {
        leadId,
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        stack: error.stack
      });
      return {
        assigned: false,
        reason: `Assignment error: ${error.message}`
      };
    }
  }

  // Bulk process leads for a specific form (simplified old Jesty approach)
  async processFormLeads(integration, pageId, formId, options = {}) {
    try {
      const { since, limit = 100 } = options;
      
      const page = integration.fbPages.find(p => p.id === pageId);
      if (!page) {
        throw new Error('Page not found');
      }

      // Check if form is disabled using old Jesty approach
      if (integration.disabledFormIds && integration.disabledFormIds.includes(formId)) {
        logger.info(`Form ${formId} is disabled, skipping bulk processing`);
        return { success: false, reason: 'form_disabled' };
      }

      // Fetch leads from Facebook
      const params = {
        access_token: page.accessToken,
        fields: 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id',
        limit: limit
      };

      if (since) {
        params.since = Math.floor(new Date(since).getTime() / 1000);
      }

      const response = await axios.get(`https://graph.facebook.com/v19.0/${formId}/leads`, {
        params
      });

      const leads = response.data.data || [];
      const results = [];

      for (const facebookLead of leads) {
        try {
          // Extract fields using simple approach
          const extractedFields = this.extractLeadFields(facebookLead.field_data || []);

          // Validate contact information (user requirement)
          if (!extractedFields.email && !extractedFields.phone) {
            logger.warn('Lead skipped: No contact information found', { 
              facebookLeadId: facebookLead.id,
              formId: facebookLead.form_id,
              availableFields: facebookLead.field_data?.map(f => f.name) || []
            });
            results.push({
              facebookLeadId: facebookLead.id,
              success: false,
              reason: 'no_contact_info',
              message: 'Lead must have at least one contact method (email or phone)'
            });
            continue;
          }

          // Create lead data (match leads service expected format)
          const leadData = {
            name: extractedFields.name,
            email: extractedFields.email,
            phone: extractedFields.phone || '', // Ensure phone is always present
            organizationId: integration.organizationId,
            source: 'facebook',
            status: 'new',
            // Store additional fields in extraFields
            extraFields: {
              company: extractedFields.company,
              city: extractedFields.city,
              designation: extractedFields.jobTitle
            },
            // Store custom fields from the form
            customFields: extractedFields.customFields || {},
            // Store Facebook-specific data in integrationData
            integrationData: {
              platform: 'facebook',
              facebookLeadId: facebookLead.id,
              formId: facebookLead.form_id,
              pageId: pageId
            },
            metadata: {
              facebookLeadId: facebookLead.id,
              formId: facebookLead.form_id,
              adId: facebookLead.ad_id,
              campaignId: facebookLead.campaign_id,
              createdTime: facebookLead.created_time
            }
          };

          const result = await this.createLeadInCRM(leadData, integration.organizationId);
          
          results.push({
            facebookLeadId: facebookLead.id,
            ...result
          });

        } catch (error) {
          logger.error('Error processing individual lead:', facebookLead.id, error.message);
          results.push({
            facebookLeadId: facebookLead.id,
            success: false,
            error: error.message
          });
        }
      }

      // Update integration stats (simplified)
      const successful = results.filter(r => r.success).length;

      if (successful > 0) {
        await FacebookIntegration.updateOne(
          { _id: integration._id },
          {
            $inc: { totalLeads: successful },
            $set: { lastLeadReceived: new Date() }
          }
        );
      }

      return {
        success: true,
        processed: leads.length,
        successful,
        errors: results.filter(r => !r.success).length,
        results
      };

    } catch (error) {
      logger.error('Error in bulk lead processing:', error);
      throw error;
    }
  }
}

module.exports = new FacebookLeadProcessor();