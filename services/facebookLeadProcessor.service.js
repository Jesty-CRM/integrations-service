const axios = require('axios');
const logger = require('../utils/logger');
const FacebookIntegration = require('../models/FacebookIntegration');
const formAssignmentService = require('./formAssignmentService');

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

      // Find integration by page ID to get organization ID
      const integration = await FacebookIntegration.findOne({
        'fbPages.id': page_id
      });

      if (!integration) {
        throw new Error(`No Facebook integration found for page ${page_id}`);
      }

      const organizationId = integration.organizationId;
      logger.info('Found integration for organization:', organizationId);

      // Find the specific page and form
      const page = integration.fbPages.find(p => p.id === page_id);
      if (!page) {
        throw new Error(`Page ${page_id} not found in integration`);
      }

      const form = page.leadForms?.find(f => f.id === form_id);
      if (!form) {
        logger.warn(`Form ${form_id} not found in page ${page_id}, processing anyway`);
      }

      // Check if form is disabled
      if (form && !form.enabled) {
        logger.info(`Form ${form_id} is disabled, skipping lead processing`);
        return { success: false, reason: 'form_disabled' };
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
        facebookLead = await this.fetchLeadFromFacebook(leadgen_id, page.accessToken);
        if (!facebookLead) {
          logger.error('Failed to fetch lead data from Facebook API');
          throw new Error('Failed to fetch lead data from Facebook');
        }
      }

      logger.info('Successfully fetched Facebook lead data:', {
        leadId: facebookLead.id,
        hasFieldData: !!facebookLead.field_data,
        fieldCount: facebookLead.field_data?.length || 0
      });

      // Extract fields using simple approach (like old Jesty backend)
      const extractedFields = this.extractLeadFields(facebookLead.field_data || []);
      
      logger.info('Extracted lead fields:', {
        name: extractedFields.name,
        email: extractedFields.email,
        phone: extractedFields.phone,
        originalFieldData: facebookLead.field_data
      });

      // Validate contact information (user requirement)
      if (!extractedFields.email && !extractedFields.phone) {
        logger.warn('Lead rejected: No contact information (email or phone) found', { 
          leadgenId: leadgen_id, 
          formId: form_id,
          availableFields: facebookLead.field_data?.map(f => f.name) || []
        });
        return { 
          success: false, 
          reason: 'no_contact_info', 
          message: 'Lead must have at least one contact method (email or phone) for dashboard display' 
        };
      }

      // Note: We'll do assignment AFTER lead creation like website integration does

      // Create lead data for CRM (match leads service expected format)
      const leadData = {
        name: extractedFields.name,
        email: extractedFields.email,
        phone: extractedFields.phone || '', // Ensure phone is always present, even if empty
        organizationId,
        source: 'facebook',
        status: 'new',
        // Don't pre-assign here - we'll do it after creation like website integration
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

      logger.info('📋 Final lead data before creation:', {
        name: leadData.name,
        email: leadData.email,
        source: leadData.source
      });

      // Create lead in CRM first (like website integration)
      const result = await this.createLeadInCRM(leadData, organizationId);
      const leadId = result.leadId;

      // Auto-assign lead AFTER creation if assignment settings are enabled (like website integration)
      if (form && form.assignmentSettings && form.assignmentSettings.enabled) {
        try {
          logger.info('🎯 Attempting auto-assignment for Facebook lead:', {
            leadId: leadId,
            integrationId: integration._id,
            formId: form_id,
            assignmentMode: form.assignmentSettings.algorithm
          });

          // Use Facebook-specific assignment logic with form settings
          const assignmentResult = await this.autoAssignFacebookLead(
            leadId,
            integration,
            page_id,
            form_id,
            integration.organizationId
          );

          if (assignmentResult.assigned) {
            logger.info('✅ Facebook lead auto-assigned successfully:', {
              leadId: leadId,
              assignedTo: assignmentResult.assignedTo,
              algorithm: assignmentResult.algorithm
            });
            result.assigned = true;
            result.assignedTo = assignmentResult.assignedTo;
          } else {
            logger.warn('⚠️ Facebook lead assignment failed:', {
              leadId: leadId,
              reason: assignmentResult.reason || 'unknown'
            });
          }
      } catch (assignmentError) {
        logger.error('Failed to auto-assign Facebook lead:', {
          leadId: leadId,
          error: assignmentError.message,
          stack: assignmentError.stack
        });
      }
    } else {
      logger.info('Assignment skipped - form assignment settings not enabled:', {
        hasForm: !!form,
        hasAssignmentSettings: !!(form && form.assignmentSettings),
        enabled: form?.assignmentSettings?.enabled
      });
    }      // Update integration statistics (simplified approach)
      await this.updateIntegrationStats(integration, result);
      
      logger.info('Successfully processed Facebook lead:', { 
        leadgenId: leadgen_id, 
        crmLeadId: result.leadId,
        action: result.action,
        assigned: result.assigned || false,
        assignedTo: result.assignedTo || 'none'
      });

      return result;

    } catch (error) {
      logger.error('Error processing Facebook webhook lead:', error);
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

  // Fetch lead from Facebook API
  async fetchLeadFromFacebook(leadId, accessToken) {
    try {
      logger.info(`Fetching lead ${leadId} from Facebook API...`);
      
      const response = await axios.get(`https://graph.facebook.com/v19.0/${leadId}`, {
        params: {
          access_token: accessToken,
          fields: 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id'
        }
      });

      logger.info('Facebook API Response:', JSON.stringify(response.data, null, 2));
      
      // Log the raw field data to see what Facebook is actually sending
      if (response.data.field_data) {
        logger.info('Raw Facebook field_data:', JSON.stringify(response.data.field_data, null, 2));
      }
      
      return response.data;
    } catch (error) {
      logger.error('Facebook API error:', error.response?.data || error.message);
      logger.error('Lead ID:', leadId);
      logger.error('Access Token (first 20 chars):', accessToken?.substring(0, 20) + '...');
      return null;
    }
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

      // Debug logging
      console.log('Sending lead data to CRM:', JSON.stringify(leadData, null, 2));

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
      console.error('CRM API Error Response:', error.response?.data || error.message);
      logger.error('Error creating lead in CRM:', error.response?.data || error.message);
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