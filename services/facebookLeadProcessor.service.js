const axios = require('axios');
const logger = require('../utils/logger');
const FacebookIntegration = require('../models/FacebookIntegration');

class FacebookLeadProcessor {
  constructor() {
    this.leadsServiceUrl = process.env.LEADS_SERVICE_URL || 'http://localhost:3002';
  }

  // Main webhook processing method
  async processWebhookLead(leadgenId, pageId, formId, organizationId) {
    try {
      logger.info('Processing Facebook webhook lead:', { leadgenId, pageId, formId, organizationId });

      // Get integration configuration
      const integration = await FacebookIntegration.findOne({
        organizationId,
        'fbPages.id': pageId
      });

      if (!integration) {
        throw new Error(`No Facebook integration found for organization ${organizationId} and page ${pageId}`);
      }

      // Find the specific page and form
      const page = integration.fbPages.find(p => p.id === pageId);
      if (!page) {
        throw new Error(`Page ${pageId} not found in integration`);
      }

      const form = page.leadForms.find(f => f.id === formId);
      if (!form) {
        logger.warn(`Form ${formId} not found in page ${pageId}, but processing lead anyway`);
      }

      // Check if form is enabled (if form config exists)
      if (form && !form.enabled) {
        logger.info(`Form ${formId} is disabled, skipping lead processing`);
        return { success: false, reason: 'form_disabled' };
      }

      // Fetch lead data from Facebook
      const facebookLead = await this.fetchLeadFromFacebook(leadgenId, page.accessToken);
      if (!facebookLead) {
        throw new Error('Failed to fetch lead data from Facebook');
      }

      // Extract fields using simple approach (like old Jesty backend)
      const extractedFields = this.extractLeadFields(facebookLead.field_data || []);

      // Create lead data for CRM
      const leadData = {
        organizationId,
        source: 'facebook_leads',
        status: 'new',
        ...extractedFields,
        metadata: {
          facebookLeadId: facebookLead.id,
          formId: facebookLead.form_id,
          adId: facebookLead.ad_id,
          campaignId: facebookLead.campaign_id,
          createdTime: facebookLead.created_time,
          rawFacebookData: facebookLead
        }
      };

      // Create lead in CRM
      const result = await this.createLeadInCRM(leadData, organizationId);

      // Update form statistics if form exists
      if (form) {
        await this.updateFormStats(integration, pageId, formId, result);
      }

      logger.info('Successfully processed Facebook lead:', { 
        leadgenId, 
        crmLeadId: result.leadId,
        action: result.action 
      });

      return result;

    } catch (error) {
      logger.error('Error processing Facebook webhook lead:', error);
      throw error;
    }
  }

  // Simple field extraction (like old Jesty backend)
  extractLeadFields(fieldData) {
    const extractedFields = {};

    fieldData.forEach(field => {
      const fieldName = field.name.toLowerCase();
      const fieldValue = field.values && field.values[0] ? field.values[0].trim() : '';

      if (!fieldValue) return;

      // Map common Facebook field names to CRM fields
      if (fieldName.includes('name') || fieldName === 'full_name' || fieldName === 'first_name') {
        if (!extractedFields.name) {
          extractedFields.name = fieldValue;
        }
      } else if (fieldName.includes('email')) {
        extractedFields.email = fieldValue.toLowerCase();
      } else if (fieldName.includes('phone') || fieldName.includes('mobile') || fieldName.includes('contact')) {
        extractedFields.phone = this.cleanPhoneNumber(fieldValue);
      } else if (fieldName.includes('company') || fieldName.includes('business')) {
        extractedFields.company = fieldValue;
      } else if (fieldName.includes('job') || fieldName.includes('title') || fieldName.includes('designation')) {
        extractedFields.jobTitle = fieldValue;
      } else if (fieldName.includes('city') || fieldName.includes('location')) {
        extractedFields.city = fieldValue;
      } else if (fieldName.includes('website') || fieldName.includes('url')) {
        extractedFields.website = fieldValue;
      } else if (fieldName.includes('budget') || fieldName.includes('price')) {
        extractedFields.budget = fieldValue;
      } else if (fieldName.includes('requirement') || fieldName.includes('message') || fieldName.includes('description')) {
        extractedFields.requirements = fieldValue;
      } else {
        // Store other fields as custom fields
        extractedFields[fieldName] = fieldValue;
      }
    });

    // Handle cases where first_name and last_name are separate
    const firstNameField = fieldData.find(f => f.name === 'first_name');
    const lastNameField = fieldData.find(f => f.name === 'last_name');
    
    if (firstNameField && lastNameField) {
      const firstName = firstNameField.values?.[0] || '';
      const lastName = lastNameField.values?.[0] || '';
      extractedFields.name = `${firstName} ${lastName}`.trim();
    }

    return extractedFields;
  }

  // Fetch lead from Facebook API
  async fetchLeadFromFacebook(leadId, accessToken) {
    try {
      const response = await axios.get(`https://graph.facebook.com/v19.0/${leadId}`, {
        params: {
          access_token: accessToken,
          fields: 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,form_id'
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Facebook API error:', error.response?.data || error.message);
      return null;
    }
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

      const response = await axios.post(`${this.leadsServiceUrl}/api/facebook-leads/import/facebook`, leadData, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || 'internal-service-token'}`
        }
      });

      return {
        success: true,
        leadId: response.data.leadId,
        action: response.data.action || 'created'
      };

    } catch (error) {
      logger.error('Error creating lead in CRM:', error.response?.data || error.message);
      throw new Error(`Failed to create lead: ${error.response?.data?.message || error.message}`);
    }
  }

  // Update form statistics (simplified)
  async updateFormStats(integration, pageId, formId, result) {
    try {
      const updateQuery = {
        'fbPages.id': pageId,
        'fbPages.leadForms.id': formId
      };

      const updateData = {
        $inc: {
          'fbPages.$[page].leadForms.$[form].totalLeads': result.success ? 1 : 0
        },
        $set: {
          'fbPages.$[page].leadForms.$[form].lastLeadReceived': new Date()
        }
      };

      await FacebookIntegration.updateOne(
        updateQuery,
        updateData,
        {
          arrayFilters: [
            { 'page.id': pageId },
            { 'form.id': formId }
          ]
        }
      );

    } catch (error) {
      logger.error('Error updating form stats:', error);
    }
  }

  // Bulk process leads for a specific form (simplified)
  async processFormLeads(integration, pageId, formId, options = {}) {
    try {
      const { since, limit = 100 } = options;
      
      const page = integration.fbPages.find(p => p.id === pageId);
      if (!page) {
        throw new Error('Page not found');
      }

      const form = page.leadForms.find(f => f.id === formId);
      if (!form) {
        throw new Error('Form not found');
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

          // Create lead data
          const leadData = {
            organizationId: integration.organizationId,
            source: 'facebook_leads',
            status: 'new',
            ...extractedFields,
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

      // Update form stats
      const successful = results.filter(r => r.success).length;

      await FacebookIntegration.updateOne(
        {
          'fbPages.id': pageId,
          'fbPages.leadForms.id': formId
        },
        {
          $inc: {
            'fbPages.$[page].leadForms.$[form].totalLeads': successful
          },
          $set: {
            'fbPages.$[page].leadForms.$[form].lastLeadReceived': new Date()
          }
        },
        {
          arrayFilters: [
            { 'page.id': pageId },
            { 'form.id': formId }
          ]
        }
      );

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