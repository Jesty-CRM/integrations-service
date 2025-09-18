const axios = require('axios');
const crypto = require('crypto');
const WebsiteIntegration = require('../models/WebsiteIntegration');
const LeadSource = require('../models/LeadSource');
const leadsServiceClient = require('./leadsService.client');
const logger = require('../utils/logger');

class WebsiteService {
  constructor() {
    this.serviceURL = process.env.SERVICE_URL || 'https://api.jestycrm.com';
  }

  // Create a new website integration
  async createIntegration(userId, organizationId, websiteData) {
    try {
      const integrationKey = this.generateIntegrationKey();
      
      // Get number of forms to create (default: 1)
      const numberOfForms = websiteData.numberOfForms || websiteData.formsCount || 1;
      
      // Auto-generate forms based on count
      let forms = [];
      for (let i = 1; i <= numberOfForms; i++) {
        forms.push({
          formId: `form-${i}`,
          formName: `Form ${i}`,
          fields: [], // No predefined fields - accept anything
          submitButtonText: 'Submit',
          successMessage: 'Thank you for your submission!',
          redirectUrl: null,
          allowDynamicFields: true, // Always allow any fields
          isActive: true
        });
      }

      // Extract lead settings or use defaults
      const leadSettings = websiteData.leadSettings || {};
      
      const integration = new WebsiteIntegration({
        organizationId,
        userId,
        domain: websiteData.domain,
        name: websiteData.name,
        integrationKey,
        
        // Auto-generated forms
        forms: forms,
        
        // Backward compatibility - use first form
        formConfig: {
          formId: forms[0].formId,
          fields: [], // No predefined fields
          submitButtonText: 'Submit',
          successMessage: 'Thank you for your submission!',
          redirectUrl: null
        },
        
        leadSettings: {
          defaultStatus: leadSettings.defaultStatus || websiteData.defaultStatus || 'New Lead',
          defaultSource: leadSettings.defaultSource || websiteData.defaultSource || 'Website',
          assignToUser: leadSettings.assignToUser || websiteData.assignToUser,
          autoRespond: leadSettings.autoRespond !== undefined ? leadSettings.autoRespond : (websiteData.autoRespond || false),
          autoResponseMessage: leadSettings.autoResponseMessage || websiteData.autoResponseMessage,
          notifyOnNewLead: leadSettings.notifyOnNewLead !== false && websiteData.notifyOnNewLead !== false,
          notifyEmail: leadSettings.notifyEmail || websiteData.notifyEmail,
          duplicateHandling: {
            enabled: leadSettings.duplicateHandling?.enabled !== false,
            checkFields: leadSettings.duplicateHandling?.checkFields || ['email', 'phone'],
            action: leadSettings.duplicateHandling?.action || 'update'
          }
        },
        
        settings: {
          enableCORS: websiteData.enableCORS !== false,
          allowedOrigins: websiteData.allowedOrigins || [],
          reCaptcha: websiteData.reCaptcha || { enabled: false }
        }
      });

      await integration.save();
      return integration;
    } catch (error) {
      logger.error('Error creating website integration:', error.message);
      throw error;
    }
  }

  // Get website integration by ID or key
  async getIntegration(identifier, organizationId) {
    try {
      let query;
      
      if (identifier.length === 32) {
        // It's an integration key
        query = { integrationKey: identifier };
      } else {
        // It's an ID
        query = { _id: identifier, organizationId };
      }

      const integration = await WebsiteIntegration.findOne(query);
      return integration;
    } catch (error) {
      logger.error('Error getting website integration:', error.message);
      throw error;
    }
  }

  // Get all integrations for an organization
  async getIntegrations(organizationId, userId = null) {
    try {
      const query = { organizationId };
      if (userId) query.userId = userId;

      const integrations = await WebsiteIntegration.find(query)
        .sort({ createdAt: -1 });

      return integrations.map(integration => ({
        id: integration._id,
        domain: integration.domain,
        name: integration.name,
        integrationKey: integration.integrationKey,
        isActive: integration.isActive,
        isVerified: integration.isVerified,
        webhookUrl: integration.webhookUrl,
        embedScript: integration.embedScript,
        stats: integration.stats,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt
      }));
    } catch (error) {
      logger.error('Error getting website integrations:', error.message);
      throw error;
    }
  }

  // Update website integration
  async updateIntegration(integrationId, organizationId, updateData) {
    try {
      const integration = await WebsiteIntegration.findOneAndUpdate(
        { _id: integrationId, organizationId },
        { $set: updateData },
        { new: true, runValidators: true }
      );

      if (!integration) {
        throw new Error('Integration not found');
      }

      return integration;
    } catch (error) {
      logger.error('Error updating website integration:', error.message);
      throw error;
    }
  }

  // Delete website integration
  async deleteIntegration(integrationId, organizationId) {
    try {
      const integration = await WebsiteIntegration.findOneAndDelete({
        _id: integrationId,
        organizationId
      });

      if (!integration) {
        throw new Error('Integration not found');
      }

      return { success: true };
    } catch (error) {
      logger.error('Error deleting website integration:', error.message);
      throw error;
    }
  }

  // Process incoming lead from website
  async processWebsiteLead(integrationKey, leadData, metadata = {}) {
    try {
      // Get integration
      const integration = await WebsiteIntegration.findOne({
        integrationKey,
        isActive: true
      });

      if (!integration) {
        throw new Error('Integration not found or inactive');
      }

      // Validate domain if CORS is enabled
      if (integration.settings.enableCORS && metadata.origin) {
        const allowedOrigins = [
          `https://${integration.domain}`,
          `http://${integration.domain}`,
          `https://www.${integration.domain}`,
          `http://www.${integration.domain}`,
          ...integration.settings.allowedOrigins
        ];

        if (!allowedOrigins.includes(metadata.origin)) {
          throw new Error('Origin not allowed');
        }
      }

      // Validate reCAPTCHA if enabled
      if (integration.settings.reCaptcha.enabled && leadData.recaptcha) {
        const isValidCaptcha = await this.validateRecaptcha(
          leadData.recaptcha,
          integration.settings.reCaptcha.secretKey
        );

        if (!isValidCaptcha) {
          throw new Error('Invalid reCAPTCHA');
        }
      }

      // Clean and validate lead data (no predefined fields - accept everything)
      const cleanedLeadData = this.cleanLeadData(leadData, []);

      // Check for existing LeadSource records with same email/phone for this organization
      const existingLeadSources = await LeadSource.find({
        organizationId: integration.organizationId,
        $or: [
          { 'leadData.email': cleanedLeadData.email },
          { 'leadData.phone': cleanedLeadData.phone }
        ]
      }).select('_id leadId leadData.email leadData.phone');

      const isDuplicate = existingLeadSources.length > 0;
      const duplicateLeadSourceIds = existingLeadSources.map(ls => ls._id);
      const duplicateLeadIds = [...new Set(existingLeadSources.map(ls => ls.leadId))]; // Unique lead IDs

      logger.info('Duplicate check results:', {
        isDuplicate,
        duplicateLeadSourceCount: existingLeadSources.length,
        duplicateLeadSourceIds,
        duplicateLeadIds,
        email: cleanedLeadData.email,
        phone: cleanedLeadData.phone
      });

      // Prepare source details for lead creation
      const sourceDetails = {
        integrationId: metadata.integrationId,
        integrationKey: integration.integrationKey,
        formId: metadata.formId,
        formName: metadata.formName,
        domain: integration.domain,
        page: metadata.page || leadData.page || '',
        referrer: metadata.referrer || leadData.referrer || '',
        utm: {
          source: leadData.utm_source,
          medium: leadData.utm_medium,
          campaign: leadData.utm_campaign,
          term: leadData.utm_term,
          content: leadData.utm_content
        },
        userAgent: metadata.userAgent,
        ipAddress: metadata.clientIP
      };

      // Send lead to leads service
      const createdLead = await this.createLead({
        ...cleanedLeadData,
        source: 'website',
        status: integration.leadSettings.defaultStatus,
        assignedTo: integration.leadSettings.assignToUser,
        organizationId: integration.organizationId,
        sourceDetails: sourceDetails
      });

      logger.info('Created lead result from leads-service:', {
        createdLead,
        leadId: createdLead.id || createdLead._id,
        hasId: !!(createdLead.id || createdLead._id)
      });

      // Create lead source record after getting leadId
      const leadId = createdLead.id || createdLead._id;
      
      if (!leadId) {
        throw new Error('No leadId returned from leads-service');
      }

      // Prepare leadData for LeadSource schema (separate standard fields from custom fields)
      const { name, email, phone, formId, referrer, userAgent, utm_source, utm_medium, utm_campaign, utm_term, utm_content, page, source, status, organizationId, sourceDetails: _, ...customFields } = cleanedLeadData;
      
      const leadSourceData = {
        name,
        email,
        phone,
        customFields // All other fields go into customFields (cleaned of system fields)
      };

      const leadSource = new LeadSource({
        leadId: leadId,
        organizationId: integration.organizationId,
        source: 'website',
        sourceDetails: sourceDetails,
        leadData: leadSourceData,
        ipAddress: metadata.ip,
        userAgent: metadata.userAgent,
        isDuplicate: isDuplicate,
        duplicateOf: isDuplicate ? duplicateLeadIds[0] : null, // Reference to first duplicate lead found
        duplicateLeadIds: duplicateLeadSourceIds, // Array of other LeadSource IDs that are duplicates
        processed: true,
        processedAt: new Date()
      });

      logger.info('Creating LeadSource with data:', {
        leadId: leadSource.leadId,
        organizationId: leadSource.organizationId,
        source: leadSource.source,
        originalCleanedData: cleanedLeadData,
        structuredLeadData: leadSourceData,
        customFieldsCount: Object.keys(customFields).length
      });

      await leadSource.save();

      // If duplicates were found, update all existing LeadSource records to create bidirectional relationships
      if (isDuplicate && duplicateLeadSourceIds.length > 0) {
        logger.info('Updating existing LeadSource records for bidirectional duplicate tracking', {
          newLeadSourceId: leadSource._id,
          duplicateLeadSourceIds
        });

        // Update all existing LeadSource records to include the new LeadSource ID in their duplicate arrays
        await LeadSource.updateMany(
          { 
            _id: { $in: duplicateLeadSourceIds },
            organizationId: integration.organizationId
          },
          {
            $set: { 
              isDuplicate: true
            },
            $addToSet: { 
              duplicateLeadIds: leadSource._id // Add this new LeadSource ID to their duplicate arrays
            }
          }
        );

        // Also update the duplicateOf field for LeadSource records that don't have it set yet
        // (this handles the case where the first LeadSource wasn't marked as duplicate initially)
        const leadSourcesWithoutDuplicateOf = await LeadSource.find({
          _id: { $in: duplicateLeadSourceIds },
          organizationId: integration.organizationId,
          duplicateOf: null
        }).select('_id leadId');

        for (const record of leadSourcesWithoutDuplicateOf) {
          // Set duplicateOf to the first duplicate lead ID found
          if (duplicateLeadIds.length > 0) {
            await LeadSource.updateOne(
              { _id: record._id, organizationId: integration.organizationId },
              { $set: { duplicateOf: duplicateLeadIds[0] } }
            );
          }
        }

        logger.info('Bidirectional duplicate relationships updated successfully');
      }

      // Update integration statistics
      await WebsiteIntegration.updateOne(
        { _id: integration._id },
        {
          $inc: { 'stats.totalLeads': 1 },
          $set: { 'stats.lastLeadReceived': new Date() }
        }
      );

      // Send auto-response if enabled
      if (integration.leadSettings.autoRespond && integration.leadSettings.autoResponseMessage) {
        await this.sendAutoResponse(cleanedLeadData.email, integration.leadSettings.autoResponseMessage);
      }

      // Send notification if enabled
      if (integration.leadSettings.notifyOnNewLead) {
        await this.sendLeadNotification(integration, cleanedLeadData);
      }

      return {
        success: true,
        message: integration.formConfig.successMessage,
        leadId: createdLead.id,
        redirectUrl: integration.formConfig.redirectUrl
      };
    } catch (error) {
      logger.error('Error processing website lead:', error.message);
      throw error;
    }
  }

  // Generate embed script for website
  generateEmbedScript(integrationKey) {
    return `
<!-- Jesty CRM Lead Capture Script -->
<script>
  (function() {
    var jestyConfig = {
      integrationKey: '${integrationKey}',
      apiUrl: '${this.serviceURL}',
      formSelector: '#lead-form, .jesty-form',
      autoCapture: true
    };

    function initJesty() {
      var forms = document.querySelectorAll(jestyConfig.formSelector);
      
      forms.forEach(function(form) {
        form.addEventListener('submit', function(e) {
          e.preventDefault();
          submitToJesty(form);
        });
      });
    }

    function submitToJesty(form) {
      var formData = new FormData(form);
      var data = {};
      
      for (var [key, value] of formData.entries()) {
        data[key] = value;
      }

      // Add tracking data
      data.page = window.location.href;
      data.referrer = document.referrer;
      data.utm_source = getUrlParameter('utm_source');
      data.utm_medium = getUrlParameter('utm_medium');
      data.utm_campaign = getUrlParameter('utm_campaign');
      data.utm_term = getUrlParameter('utm_term');
      data.utm_content = getUrlParameter('utm_content');

      fetch(jestyConfig.apiUrl + '/api/webhooks/website/' + jestyConfig.integrationKey, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          if (result.redirectUrl) {
            window.location.href = result.redirectUrl;
          } else {
            alert(result.message || 'Thank you for your submission!');
          }
        } else {
          alert('Error: ' + (result.message || 'Submission failed'));
        }
      })
      .catch(error => {
        console.error('Jesty submission error:', error);
        alert('Submission failed. Please try again.');
      });
    }

    function getUrlParameter(name) {
      name = name.replace(/[\\[]/, '\\\\[').replace(/[\\]]/, '\\\\]');
      var regex = new RegExp('[\\\\?&]' + name + '=([^&#]*)');
      var results = regex.exec(location.search);
      return results === null ? '' : decodeURIComponent(results[1].replace(/\\+/g, ' '));
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initJesty);
    } else {
      initJesty();
    }
  })();
</script>
`;
  }

  // Verify website integration
  async verifyIntegration(integrationKey) {
    try {
      const integration = await WebsiteIntegration.findOne({ integrationKey });
      
      if (!integration) {
        throw new Error('Integration not found');
      }

      // Generate verification code
      const verificationCode = crypto.randomBytes(16).toString('hex');
      
      await WebsiteIntegration.updateOne(
        { _id: integration._id },
        { 
          verificationCode,
          isVerified: false
        }
      );

      return {
        verificationCode,
        instructions: `Add this meta tag to your website's <head> section: <meta name="jesty-verification" content="${verificationCode}" />`
      };
    } catch (error) {
      logger.error('Error initiating website verification:', error.message);
      throw error;
    }
  }

  // Complete website verification
  async completeVerification(integrationKey) {
    try {
      const integration = await WebsiteIntegration.findOne({ integrationKey });
      
      if (!integration || !integration.verificationCode) {
        throw new Error('Integration not found or verification not initiated');
      }

      // Check if verification code is present on the website
      const response = await axios.get(`https://${integration.domain}`, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Jesty-CRM-Verification-Bot/1.0'
        }
      });

      const htmlContent = response.data;
      const verificationRegex = new RegExp(`<meta\\s+name=["']jesty-verification["']\\s+content=["']${integration.verificationCode}["']`, 'i');
      
      if (verificationRegex.test(htmlContent)) {
        await WebsiteIntegration.updateOne(
          { _id: integration._id },
          {
            isVerified: true,
            verifiedAt: new Date(),
            verificationCode: null
          }
        );

        return { success: true, message: 'Website verified successfully' };
      } else {
        throw new Error('Verification code not found on website');
      }
    } catch (error) {
      logger.error('Error completing website verification:', error.message);
      throw error;
    }
  }

  // Helper methods
  generateIntegrationKey() {
    return crypto.randomBytes(16).toString('hex');
  }

  cleanLeadData(rawData, formFields = []) {
    const cleanedData = {};
    
    // Identity field mapping (map user's fields to our standard fields)
    const identityMapping = {
      // Name variations
      'fullName': 'name',
      'full_name': 'name', 
      'firstName': 'name',
      'first_name': 'name',
      'lastName': 'name',
      'last_name': 'name',
      'customer_name': 'name',
      'user_name': 'name',
      'username': 'name',
      
      // Email variations
      'emailAddress': 'email',
      'email_address': 'email',
      'user_email': 'email',
      'customer_email': 'email',
      'mail': 'email',
      
      // Phone variations
      'phoneNumber': 'phone',
      'phone_number': 'phone',
      'mobile': 'phone',
      'mobileNumber': 'phone',
      'mobile_number': 'phone',
      'tel': 'phone',
      'telephone': 'phone',
      'contact': 'phone',
      'contactNumber': 'phone',
      'contact_number': 'phone'
    };

    // Process all fields from rawData
    Object.keys(rawData).forEach(key => {
      const value = rawData[key];
      
      // Skip empty values
      if (value === null || value === undefined || value === '') {
        return;
      }
      
      // Check if this field should be mapped to a standard field
      if (identityMapping[key]) {
        const standardField = identityMapping[key];
        cleanedData[standardField] = value;
      } else {
        // Keep custom fields as-is (interests, experience, budget, etc.)
        cleanedData[key] = value;
      }
    });

    // Ensure we have at least name, email, or phone for lead creation
    const hasIdentity = cleanedData.name || cleanedData.email || cleanedData.phone;
    if (!hasIdentity) {
      // Try to create name from any available data
      if (rawData.firstName && rawData.lastName) {
        cleanedData.name = `${rawData.firstName} ${rawData.lastName}`.trim();
      } else if (rawData.first_name && rawData.last_name) {
        cleanedData.name = `${rawData.first_name} ${rawData.last_name}`.trim();
      }
    }

    return cleanedData;
  }

  async validateRecaptcha(token, secretKey) {
    try {
      const response = await axios.post('https://www.google.com/recaptcha/api/siteverify', null, {
        params: {
          secret: secretKey,
          response: token
        }
      });

      return response.data.success;
    } catch (error) {
      logger.error('reCAPTCHA validation error:', error.message);
      return false;
    }
  }

  async createLead(leadData) {
    try {
      logger.info('Creating lead via leads service client', { 
        organizationId: leadData.organizationId,
        email: leadData.email 
      });

      const result = await leadsServiceClient.createLeadFromWebsite(leadData, leadData.organizationId);
      
      logger.info('Lead created successfully', { 
        leadId: result.lead?._id || result.lead?.id,
        success: result.success 
      });

      return {
        id: result.lead?._id || result.lead?.id,
        _id: result.lead?._id || result.lead?.id,
        ...result.lead
      };
    } catch (error) {
      logger.error('Error creating lead via leads service:', {
        error: error.message,
        organizationId: leadData.organizationId,
        email: leadData.email
      });
      throw error;
    }
  }

  async sendAutoResponse(email, message) {
    try {
      // This would integrate with your email service
      logger.info('Auto-response sent to:', email);
    } catch (error) {
      logger.error('Error sending auto-response:', error.message);
    }
  }

  async sendLeadNotification(integration, leadData) {
    try {
      // This would integrate with your notification service
      logger.info('Lead notification sent for integration:', integration.name);
    } catch (error) {
      logger.error('Error sending lead notification:', error.message);
    }
  }

  // Handle website lead from webhook (public endpoint)
  async handleWebsiteLead(leadData, headers) {
    try {
      // Extract metadata from headers
      const metadata = {
        referer: headers.referer || headers.origin || '',
        userAgent: headers['user-agent'] || '',
        clientIP: headers['x-forwarded-for']?.split(',')[0] || headers['x-real-ip'] || 'unknown'
      };

      // Extract integration key, form ID, and other info
      const integrationKey = headers['x-integration-key'] || leadData.integrationKey;
      const formId = headers['x-form-id'] || leadData.formId || 'form-1'; // Default to form-1
      const organizationId = headers['x-organization-id'] || leadData.organizationId;
      const websiteDomain = headers['x-website-domain'] || leadData.websiteDomain;

      let integration = null;

      logger.info('Looking for integration:', {
        integrationKey,
        organizationId,
        websiteDomain
      });

      // Find integration by key (preferred method)
      if (integrationKey) {
        integration = await WebsiteIntegration.findOne({ 
          integrationKey,
          isActive: true 
        });
        logger.info('Integration search by key result:', {
          found: !!integration,
          integrationKey
        });
      }
      // Fallback: find by organization ID and domain
      else if (organizationId && websiteDomain) {
        integration = await WebsiteIntegration.findOne({
          organizationId,
          domain: websiteDomain,
          isActive: true
        });
        logger.info('Integration search by org+domain result:', {
          found: !!integration,
          organizationId,
          websiteDomain
        });
      }

      if (!integration) {
        logger.warn('No integration found with criteria:', {
          integrationKey,
          organizationId,
          websiteDomain
        });
        
        return {
          success: false,
          message: 'Website integration not found or inactive'
        };
      }

      logger.info('Integration found:', {
        id: integration._id,
        domain: integration.domain,
        isActive: integration.isActive
      });

      // Find the specific form configuration (if provided)
      const formConfig = integration.forms?.find(form => form.formId === formId) || integration.forms?.[0] || {};
      
      // Add form information to metadata
      const enhancedMetadata = {
        ...metadata,
        formId: formId,
        formName: formConfig.formName || `Form ${formId}`,
        integrationId: integration._id
      };

      // Process the lead with enhanced data
      const result = await this.processWebsiteLead(integration.integrationKey, leadData, enhancedMetadata);

      // Update stats
      await WebsiteIntegration.updateOne(
        { _id: integration._id },
        {
          $inc: { 
            'stats.totalLeads': 1,
            'stats.thisMonth': 1
          },
          $set: { 'stats.lastLeadAt': new Date() }
        }
      );

      return {
        success: true,
        leadId: result.leadId,
        message: result.message,
        redirectUrl: result.redirectUrl
      };
    } catch (error) {
      logger.error('Error handling website lead webhook:', {
        error: error.message,
        leadData: leadData,
        stack: error.stack
      });

      return {
        success: false,
        message: error.message || 'Failed to process website lead'
      };
    }
  }
}

module.exports = new WebsiteService();
