const axios = require('axios');
const crypto = require('crypto');
const WebsiteIntegration = require('../models/WebsiteIntegration');
const LeadSource = require('../models/LeadSource');
const logger = require('../utils/logger');

class WebsiteService {
  constructor() {
    this.serviceURL = process.env.SERVICE_URL || 'https://api.jestycrm.com';
  }

  // Create a new website integration
  async createIntegration(userId, organizationId, websiteData) {
    try {
      const integrationKey = this.generateIntegrationKey();
      
      // Extract form config fields or use defaults
      const formFields = websiteData.formConfig?.fields || websiteData.fields || [
        { name: 'fullName', label: 'Full Name', type: 'text', required: true, placeholder: 'Enter your full name' },
        { name: 'email', label: 'Email Address', type: 'email', required: true, placeholder: 'Enter your email' },
        { name: 'phone', label: 'Phone Number', type: 'phone', required: false, placeholder: 'Enter your phone number' },
        { name: 'message', label: 'Message', type: 'textarea', required: false, placeholder: 'Tell us about your requirements' }
      ];

      // Extract lead settings or use defaults
      const leadSettings = websiteData.leadSettings || {};
      
      const integration = new WebsiteIntegration({
        organizationId,
        userId,
        domain: websiteData.domain,
        name: websiteData.name,
        integrationKey,
        formConfig: {
          formId: websiteData.formConfig?.formId || websiteData.formId || '#lead-form',
          fields: formFields,
          submitButtonText: websiteData.formConfig?.submitButtonText || websiteData.submitButtonText || 'Submit',
          successMessage: websiteData.formConfig?.successMessage || websiteData.successMessage || 'Thank you for your submission!',
          redirectUrl: websiteData.formConfig?.redirectUrl || websiteData.redirectUrl
        },
        leadSettings: {
          defaultStatus: leadSettings.defaultStatus || websiteData.defaultStatus || 'New Lead',
          assignToUser: leadSettings.assignToUser || websiteData.assignToUser,
          autoRespond: leadSettings.autoRespond !== undefined ? leadSettings.autoRespond : (websiteData.autoRespond || false),
          autoResponseMessage: leadSettings.autoResponseMessage || websiteData.autoResponseMessage,
          notifyOnNewLead: leadSettings.notifyOnNewLead !== false && websiteData.notifyOnNewLead !== false,
          notifyEmail: leadSettings.notifyEmail || websiteData.notifyEmail
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

      // Clean and validate lead data
      const cleanedLeadData = this.cleanLeadData(leadData, integration.formConfig.fields);

      // Create lead source record
      const leadSource = new LeadSource({
        organizationId: integration.organizationId,
        source: 'website',
        sourceDetails: {
          domain: integration.domain,
          page: metadata.page || leadData.page || '',
          referrer: metadata.referrer || leadData.referrer || '',
          utm: {
            source: leadData.utm_source,
            medium: leadData.utm_medium,
            campaign: leadData.utm_campaign,
            term: leadData.utm_term,
            content: leadData.utm_content
          }
        },
        leadData: cleanedLeadData,
        ipAddress: metadata.ip,
        userAgent: metadata.userAgent,
        processed: false
      });

      // Send lead to leads service
      const createdLead = await this.createLead({
        ...cleanedLeadData,
        source: 'website',
        status: integration.leadSettings.defaultStatus,
        assignedTo: integration.leadSettings.assignToUser,
        organizationId: integration.organizationId,
        sourceDetails: leadSource.sourceDetails
      });

      // Update lead source with created lead ID
      leadSource.leadId = createdLead.id;
      leadSource.processed = true;
      leadSource.processedAt = new Date();
      await leadSource.save();

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

  cleanLeadData(rawData, formFields) {
    const cleanedData = {};
    
    formFields.forEach(field => {
      if (rawData[field.name]) {
        cleanedData[field.name] = rawData[field.name];
      }
    });

    // Always include standard fields if present
    ['name', 'email', 'phone', 'company', 'message'].forEach(field => {
      if (rawData[field]) {
        cleanedData[field] = rawData[field];
      }
    });

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
      const response = await axios.post(`${process.env.LEADS_SERVICE_URL}/api/leads`, leadData, {
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Auth': process.env.SERVICE_AUTH_TOKEN
        }
      });

      return response.data;
    } catch (error) {
      logger.error('Error creating lead via leads service:', error.response?.data || error.message);
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
}

module.exports = new WebsiteService();
