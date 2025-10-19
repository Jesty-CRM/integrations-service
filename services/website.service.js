const axios = require('axios');
const crypto = require('crypto');
const WebsiteIntegration = require('../models/WebsiteIntegration');
// Removed LeadSource - now handled by leads-service
const leadsServiceClient = require('./leadsService.client');
const logger = require('../utils/logger');

class WebsiteService {
  constructor() {
    this.serviceURL = process.env.SERVICE_URL || 'https://api.jestycrm.com/integrations';
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
  async processWebsiteLead(integrationKey, leadData, metadata = {}, adminToken = null) {
    try {
      // For website leads (external source), no manual token needed - automatic authentication
      // Admin token only used for integration management, not lead creation
      logger.info('Processing website lead with automatic authentication');

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

      // Check for existing LeadSource records via leads-service
      const existingLeadSources = await leadsServiceClient.findDuplicateLeadSources(
        integration.organizationId,
        cleanedLeadData.email,
        cleanedLeadData.phone
      );

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
        integrationName: integration.name,
        integrationDomain: integration.domain,
        webhookUrl: `${process.env.SERVICE_URL || 'http://localhost:3005'}/api/webhooks/website/${integration.integrationKey}`,
        sourceId: `website_${Date.now()}_${integration.organizationId}`, // Include sourceId in sourceDetails instead of customFields
        formId: metadata.formId,
        formName: metadata.formName,
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
      // Extract core fields and extra fields for lead creation
      const { name, email, phone, message, company, interests, ...otherFields } = cleanedLeadData;
      
      const createdLead = await this.createLead({
        name,
        email,
        phone,
        message,
        company,
        interests, // Add interests field
        source: 'website',
        status: integration.leadSettings.defaultStatus,
        assignedTo: integration.leadSettings.assignToUser,
        organizationId: integration.organizationId,
        integrationId: integration._id, // Pass integration ID for auto-assignment
        sourceDetails: sourceDetails,
        // Add website-specific information for sourceDetails
        websiteUrl: integration.domain,
        websiteName: integration.name,
        formId: cleanedLeadData.formId,
        ...otherFields // Spread other custom fields directly
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
      const { formId, referrer, userAgent, utm_source, utm_medium, utm_campaign, utm_term, utm_content, page, source, status, organizationId, sourceDetails: _, ...customFields } = cleanedLeadData;
      
      const leadSourceData = {
        name,
        email,
        phone,
        customFields // All other fields go into customFields (cleaned of system fields)
      };

      // Create LeadSource via leads-service
      const leadSourcePayload = {
        organizationId: integration.organizationId,
        leadId: leadId,
        source: 'website',
        sourceDetails: sourceDetails,
        leadData: leadSourceData,
        ipAddress: metadata.ip,
        userAgent: metadata.userAgent
      };

      logger.info('Creating LeadSource via leads-service:', {
        leadId: leadId,
        organizationId: integration.organizationId,
        source: 'website',
        originalCleanedData: cleanedLeadData,
        structuredLeadData: leadSourceData,
        customFieldsCount: Object.keys(customFields).length
      });

      const createdLeadSource = await leadsServiceClient.createLeadSource(leadSourcePayload);

      logger.info('LeadSource created successfully:', {
        leadSourceId: createdLeadSource._id,
        leadId: leadId,
        isDuplicate: createdLeadSource.isDuplicate
      });

      // Update integration statistics
      await WebsiteIntegration.updateOne(
        { _id: integration._id },
        {
          $inc: { 'stats.totalLeads': 1 },
          $set: { 'stats.lastLeadReceived': new Date() }
        }
      );

      // Auto-assign lead if assignment settings are enabled
      if (integration.assignmentSettings && integration.assignmentSettings.enabled) {
        try {
          logger.info('Attempting auto-assignment for website lead:', {
            leadId: leadId,
            integrationId: integration._id,
            assignmentMode: integration.assignmentSettings.mode,
            algorithm: integration.assignmentSettings.algorithm
          });

          // Use existing autoAssignLead method which handles the complete assignment flow
          const assignmentService = require('./assignmentService');
          
          const assignmentResult = await assignmentService.autoAssignLead(
            leadId,
            'website',
            integration._id,
            null // No admin token needed for auto-assignment
          );

          if (assignmentResult.assigned) {
            logger.info('Website lead auto-assigned successfully:', {
              leadId: leadId,
              assignedTo: assignmentResult.assignedTo,
              assignedBy: assignmentResult.assignedBy,
              algorithm: assignmentResult.algorithm
            });

            // Send real-time notification for lead assignment
            const notificationPayload = {
              assignedTo: assignmentResult.assignedTo,
              assignedBy: 'system',
              organizationId: integration.organizationId,
              leadData: {
                _id: leadId,
                name: name,
                email: email,
                phone: phone,
                source: 'website'
              }
            };

            // Send notification to notifications-service
            try {
              const axios = require('axios');
              const notificationsUrl = process.env.NOTIFICATIONS_SERVICE_URL || 'http://localhost:3006';
              
              await axios.post(`${notificationsUrl}/api/notifications/realtime/lead-assignment`, notificationPayload, {
                headers: {
                  'Content-Type': 'application/json',
                  'X-Source-Type': 'auto-assignment'
                },
                timeout: 5000
              });

              logger.info('Real-time assignment notification sent successfully');
            } catch (notifError) {
              logger.error('Failed to send real-time assignment notification:', notifError.message);
              // Don't fail the whole process if notification fails
            }
          } else {
            logger.warn('Website lead assignment failed:', {
              leadId: leadId,
              reason: assignmentResult.reason || 'No eligible users found'
            });
          }
        } catch (assignmentError) {
          logger.error('Error during auto-assignment:', assignmentError.message);
          // Don't fail the whole process if assignment fails
        }
      } else {
        logger.info('Auto-assignment disabled for this integration');
      }

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
      const leadId = result.lead?._id || result.lead?.id;
      
      logger.info('Lead created successfully', { 
        leadId: leadId,
        success: result.success 
      });

      return {
        id: leadId,
        _id: leadId,
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
      // Support both formats: nested fields and flat structure
      let processedLeadData = { ...leadData };
      
      // If leadData has a 'fields' property, flatten it to root level
      if (leadData.fields && typeof leadData.fields === 'object') {
        logger.info('Detected nested fields format, flattening to root level');
        
        // Merge fields to root level
        processedLeadData = {
          ...leadData,
          ...leadData.fields
        };
        
        // Remove the nested fields property
        delete processedLeadData.fields;
        
        logger.info('Flattened leadData:', {
          original: leadData,
          processed: processedLeadData
        });
      }

      // Extract metadata from headers
      const metadata = {
        referer: headers.referer || headers.origin || '',
        userAgent: headers['user-agent'] || '',
        clientIP: headers['x-forwarded-for']?.split(',')[0] || headers['x-real-ip'] || 'unknown'
      };

      // Extract integration key, form ID, and other info
      const integrationKey = headers['x-integration-key'] || processedLeadData.integrationKey;
      const formId = headers['x-form-id'] || processedLeadData.formId || 'form-1'; // Default to form-1
      const organizationId = headers['x-organization-id'] || processedLeadData.organizationId;
      const websiteDomain = headers['x-website-domain'] || processedLeadData.websiteDomain;

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

      // Extract admin token from headers if available (check both cases)
      const adminToken = (headers.authorization || headers.Authorization)?.replace('Bearer ', '') || null;
      
      logger.info('Admin token extracted:', {
        hasToken: !!adminToken,
        tokenLength: adminToken?.length || 0,
        headerKeys: Object.keys(headers)
      });

      // Process the lead with enhanced data (no admin token needed for external sources)
      const result = await this.processWebsiteLead(integration.integrationKey, processedLeadData, enhancedMetadata);

      // Stats are already updated in processWebsiteLead()
      // No need to update stats here to avoid double counting

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

  // Generate embed code for integration
  generateEmbedCode(integration) {
    const integrationKey = integration.integrationKey;
    const domain = integration.domain;
    
    return `
<!-- Jesty CRM Integration Embed Code -->
<div id="jesty-form-container"></div>
<script>
(function() {
  var script = document.createElement('script');
  script.src = '${this.serviceURL}/js/form-embed.js';
  script.async = true;
  script.onload = function() {
    JestyForm.init({
      integrationKey: '${integrationKey}',
      containerId: 'jesty-form-container',
      domain: '${domain}',
      apiUrl: '${this.serviceURL}'
    });
  };
  document.head.appendChild(script);
})();
</script>
<!-- End Jesty CRM Integration -->
    `.trim();
  }

  // Generate integration code for different platforms
  generateIntegrationCode(integration, type = 'javascript') {
    try {
      if (!integration) {
        throw new Error('Integration object is required');
      }
      
      if (!integration.integrationKey) {
        throw new Error('Integration key is missing');
      }
      
      const integrationKey = integration.integrationKey;
      const webhookUrl = `${process.env.SERVICE_URL || 'http://localhost:3005'}/api/webhooks/website/${integrationKey}`;
      
      logger.info('Generating integration code:', {
        type: type,
        integrationKey: integrationKey,
        webhookUrl: webhookUrl
      });
      
      switch (type.toLowerCase()) {
        case 'javascript':
        case 'js':
          return this.generateJavaScriptCode(integration);
        
        case 'typescript':
        case 'ts':
          return this.generateTypeScriptCode(integration);
        
        case 'php':
          return this.generatePHPCode(integration);
        
        default:
          throw new Error(`Unsupported code type: ${type}. Supported types: javascript, typescript, php`);
      }
    } catch (error) {
      logger.error('Error in generateIntegrationCode:', {
        error: error.message,
        type: type,
        integration: integration ? integration.integrationKey : 'null'
      });
      throw error;
    }
  }

  // Generate HTML form code - Simple copy-paste template
  generateHTMLCode(integration) {
    const integrationKey = integration.integrationKey;
    const webhookUrl = `${process.env.SERVICE_URL || 'http://localhost:3005'}/api/webhooks/website/${integrationKey}`;
    
    return `
<!-- 
  ✅ SIMPLE JESTY CRM FORM
  Integration: ${integration.name}
  Just copy and paste this entire code to your website!
-->

<!DOCTYPE html>
<html>
<head>
    <title>Contact Form - ${integration.name}</title>
    <style>
        .jesty-form {
            max-width: 500px;
            margin: 20px auto;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
            font-family: Arial, sans-serif;
        }
        .form-field {
            margin-bottom: 15px;
        }
        .form-field label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
            color: #333;
        }
        .form-field input, 
        .form-field textarea {
            width: 100%;
            padding: 10px;
            border: 2px solid #ddd;
            border-radius: 5px;
            font-size: 16px;
            box-sizing: border-box;
        }
        .form-field input:focus, 
        .form-field textarea:focus {
            border-color: #007bff;
            outline: none;
        }
        .submit-btn {
            background-color: #007bff;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            width: 100%;
        }
        .submit-btn:hover {
            background-color: #0056b3;
        }
        .submit-btn:disabled {
            background-color: #ccc;
            cursor: not-allowed;
        }
        .message {
            padding: 15px;
            margin: 15px 0;
            border-radius: 5px;
            text-align: center;
        }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    </style>
</head>
<body>
    <!-- 📝 YOUR FORM (customize fields as needed) -->
    <div class="jesty-form">
        <h2>Contact Us</h2>
        <form id="contact-form">
            <!-- Required Fields -->
            <div class="form-field">
                <label>Name *</label>
                <input type="text" name="name" required>
            </div>
            
            <div class="form-field">
                <label>Email *</label>
                <input type="email" name="email" required>
            </div>
            
            <!-- Optional Fields (add/remove as needed) -->
            <div class="form-field">
                <label>Phone</label>
                <input type="tel" name="phone">
            </div>
            
            <div class="form-field">
                <label>Company</label>
                <input type="text" name="company">
            </div>
            
            <div class="form-field">
                <label>Message</label>
                <textarea name="message" rows="4"></textarea>
            </div>
            
            <!-- Add more fields here if needed -->
            <!--
            <div class="form-field">
                <label>Budget</label>
                <select name="budget">
                    <option value="">Select Budget</option>
                    <option value="under-10k">Under $10,000</option>
                    <option value="10k-50k">$10,000 - $50,000</option>
                    <option value="over-50k">Over $50,000</option>
                </select>
            </div>
            -->
            
            <button type="submit" class="submit-btn">Send Message</button>
        </form>
        
        <!-- Message area -->
        <div id="message-area"></div>
    </div>

    <!-- 🔧 JESTY CRM INTEGRATION (pre-configured, don't change) -->
    <script>
        // Pre-configured settings
        const JESTY_CONFIG = {
            apiKey: '${integrationKey}',
            url: '${webhookUrl}'
        };
        
        // Auto-connect to form
        document.getElementById('contact-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const submitBtn = this.querySelector('.submit-btn');
            const messageArea = document.getElementById('message-area');
            
            // Show loading
            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';
            messageArea.innerHTML = '';
            
            // Get form data
            const formData = new FormData(this);
            const data = {};
            for (let [key, value] of formData.entries()) {
                data[key] = value;
            }
            
            try {
                // Send to Jesty CRM
                const response = await fetch(JESTY_CONFIG.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Integration-Key': JESTY_CONFIG.apiKey,
                        'X-Form-ID': 'contact-form'
                    },
                    body: JSON.stringify({
                        ...data,
                        formId: 'contact-form',
                        page: window.location.href,
                        timestamp: new Date().toISOString()
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    messageArea.innerHTML = '<div class="message success">✅ Thank you! Your message has been sent successfully.</div>';
                    this.reset();
                } else {
                    messageArea.innerHTML = '<div class="message error">❌ Sorry, there was an error. Please try again.</div>';
                }
            } catch (error) {
                messageArea.innerHTML = '<div class="message error">❌ Connection error. Please check your internet and try again.</div>';
            } finally {
                // Reset button
                submitBtn.disabled = false;
                submitBtn.textContent = 'Send Message';
            }
        });
        
        console.log('✅ Jesty CRM form connected successfully!');
    </script>
</body>
</html>

<!-- 
🎯 INSTRUCTIONS:
1. Copy this entire code
2. Save as .html file 
3. Upload to your website
4. Customize the form fields as needed
5. That's it! Leads will go to your CRM automatically.

✅ Everything is pre-configured with your API key
✅ No complex setup required
✅ Works on any website
-->
    `.trim();
  }

  // Generate JavaScript integration code - Clean and simple
  generateJavaScriptCode(integration) {
    const integrationKey = integration.integrationKey;
    const webhookUrl = `${process.env.SERVICE_URL || 'http://localhost:3005'}/api/webhooks/website/${integrationKey}`;
    
    return `// Jesty CRM Integration
// Integration: ${integration.name}

const JestyCRM = {
  apiKey: '${integrationKey}',
  url: '${webhookUrl}',
  
  // Connect to form by ID
  connectForm: function(formId) {
    const form = document.getElementById(formId);
    if (!form) {
      console.error('Form not found:', formId);
      return;
    }
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(form);
      const data = {};
      for (let [key, value] of formData.entries()) {
        data[key] = value;
      }
      
      const result = await JestyCRM.send(data, formId);
      
      if (result.success) {
        alert('Thank you! Your message has been sent.');
        form.reset();
      } else {
        alert('Sorry, there was an error. Please try again.');
      }
    });
    
    console.log('JestyCRM connected to form:', formId);
  },
  
  // Send data directly
  send: async function(data, formName = 'website-form') {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Integration-Key': this.apiKey,
          'X-Form-ID': formName
        },
        body: JSON.stringify({
          ...data,
          formId: formName,
          page: window.location.href,
          timestamp: new Date().toISOString()
        })
      });
      
      return await response.json();
    } catch (error) {
      console.error('JestyCRM Error:', error);
      return { success: false, message: 'Connection error' };
    }
  }
};

// Usage Examples:
// JestyCRM.connectForm('contact-form');
// JestyCRM.send({name: 'John Doe', contact: 'john@example.com'});
// Or: JestyCRM.send({name: 'John Doe', contact: '123-456-7890'});`.trim();
  }

  // Generate TypeScript integration code
  generateTypeScriptCode(integration) {
    const integrationKey = integration.integrationKey;
    const webhookUrl = `${process.env.SERVICE_URL || 'http://localhost:3005'}/api/webhooks/website/${integrationKey}`;
    
    return `// Jesty CRM Integration - TypeScript
// Integration: ${integration.name}

interface LeadData {
  name: string;
  contact: string; // Phone or Email
  // Add more fields as needed
}

class JestyCRM {
  private apiKey = '${integrationKey}';
  private url = '${webhookUrl}';
  
  async send(data: LeadData): Promise<{success: boolean}> {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Integration-Key': this.apiKey
        },
        body: JSON.stringify({...data, timestamp: new Date().toISOString()})
      });
      
      return {success: response.ok};
    } catch (error) {
      console.error('CRM Error:', error);
      return {success: false};
    }
  }
  
  connectForm(formId: string): void {
    const form = document.getElementById(formId) as HTMLFormElement;
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data: LeadData = {
        name: formData.get('name') as string,
        contact: formData.get('contact') as string
      };
      
      const result = await this.send(data);
      alert(result.success ? 'Thank you!' : 'Error occurred');
    });
  }
}

// Usage:
// const crm = new JestyCRM();
// crm.send({name: 'John', contact: 'john@example.com'});
// Or: crm.send({name: 'John', contact: '123-456-7890'});`.trim();
  }

  // Generate React component code - Generic customizable form
  generateReactCode(integration) {
    const integrationKey = integration.integrationKey;
    const webhookUrl = `${process.env.SERVICE_URL || 'http://localhost:3005'}/api/webhooks/website/${integrationKey}`;
    
    return `
import React, { useState } from 'react';

/**
 * Jesty CRM React Form Component
 * Customizable form component for lead generation
 * Add/remove fields as needed for your use case
 */
const JestyCRMForm = ({ 
  formId = 'react-form',
  title = 'Contact Us',
  submitText = 'Submit',
  successMessage = 'Thank you for your submission!',
  className = 'jesty-crm-form',
  onSuccess,
  onError
}) => {
  // Form state - Add/remove fields as needed
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    message: ''
    // Add more fields here:
    // jobTitle: '',
    // industry: '',
    // budget: '',
    // timeline: ''
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus(null);

    try {
      const response = await fetch('${webhookUrl}', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Integration-Key': '${integrationKey}',
          'X-Form-ID': formId
        },
        body: JSON.stringify({
          ...formData,
          formId: formId,
          page: window.location.href,
          referrer: document.referrer,
          timestamp: new Date().toISOString()
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setSubmitStatus({ type: 'success', message: successMessage });
        setFormData({ 
          name: '', 
          email: '', 
          phone: '', 
          company: '', 
          message: ''
          // Reset additional fields:
          // jobTitle: '',
          // industry: '',
          // budget: '',
          // timeline: ''
        });
        
        // Call success callback if provided
        onSuccess?.(result);
      } else {
        const errorMsg = result.message || 'Failed to submit form';
        setSubmitStatus({ type: 'error', message: errorMsg });
        onError?.(errorMsg);
      }
    } catch (error) {
      const errorMsg = 'Network error. Please try again.';
      setSubmitStatus({ type: 'error', message: errorMsg });
      onError?.(errorMsg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={className}>
      {title && <h3 className="form-title">{title}</h3>}
      
      <form onSubmit={handleSubmit}>
        {/* Required Fields */}
        <div className="form-group">
          <label htmlFor="name">Name *</label>
          <input
            type="text"
            id="name"
            name="name"
            value={formData.name}
            onChange={handleChange}
            required
            disabled={isSubmitting}
            placeholder="Enter your full name"
          />
        </div>

        <div className="form-group">
          <label htmlFor="email">Email *</label>
          <input
            type="email"
            id="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
            disabled={isSubmitting}
            placeholder="Enter your email address"
          />
        </div>

        {/* Optional Fields - Customize as needed */}
        <div className="form-group">
          <label htmlFor="phone">Phone</label>
          <input
            type="tel"
            id="phone"
            name="phone"
            value={formData.phone}
            onChange={handleChange}
            disabled={isSubmitting}
            placeholder="Enter your phone number"
          />
        </div>

        <div className="form-group">
          <label htmlFor="company">Company</label>
          <input
            type="text"
            id="company"
            name="company"
            value={formData.company}
            onChange={handleChange}
            disabled={isSubmitting}
            placeholder="Enter your company name"
          />
        </div>

        <div className="form-group">
          <label htmlFor="message">Message</label>
          <textarea
            id="message"
            name="message"
            value={formData.message}
            onChange={handleChange}
            rows="4"
            disabled={isSubmitting}
            placeholder="Tell us about your needs..."
          />
        </div>

        {/* Add more fields here as needed */}
        {/*
        <div className="form-group">
          <label htmlFor="jobTitle">Job Title</label>
          <input
            type="text"
            id="jobTitle"
            name="jobTitle"
            value={formData.jobTitle}
            onChange={handleChange}
            disabled={isSubmitting}
            placeholder="Your job title"
          />
        </div>

        <div className="form-group">
          <label htmlFor="industry">Industry</label>
          <select
            id="industry"
            name="industry"
            value={formData.industry}
            onChange={handleChange}
            disabled={isSubmitting}
          >
            <option value="">Select Industry</option>
            <option value="technology">Technology</option>
            <option value="healthcare">Healthcare</option>
            <option value="finance">Finance</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="budget">Budget Range</label>
          <select
            id="budget"
            name="budget"
            value={formData.budget}
            onChange={handleChange}
            disabled={isSubmitting}
          >
            <option value="">Select Budget</option>
            <option value="under-10k">Under $10,000</option>
            <option value="10k-50k">$10,000 - $50,000</option>
            <option value="50k-100k">$50,000 - $100,000</option>
            <option value="over-100k">Over $100,000</option>
          </select>
        </div>
        */}

        <button 
          type="submit" 
          disabled={isSubmitting}
          className="submit-button"
        >
          {isSubmitting ? 'Submitting...' : submitText}
        </button>

        {submitStatus && (
          <div className={\`status-message status-\${submitStatus.type}\`}>
            {submitStatus.message}
          </div>
        )}
      </form>

      <style jsx>{\`
        .form-group {
          margin-bottom: 1rem;
        }
        
        .form-group label {
          display: block;
          margin-bottom: 0.25rem;
          font-weight: 600;
          color: #374151;
        }
        
        .form-group input,
        .form-group textarea,
        .form-group select {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 1rem;
        }
        
        .form-group input:focus,
        .form-group textarea:focus,
        .form-group select:focus {
          outline: none;
          border-color: #3b82f6;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }
        
        .submit-button {
          background-color: #3b82f6;
          color: white;
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 0.375rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .submit-button:hover:not(:disabled) {
          background-color: #2563eb;
        }
        
        .submit-button:disabled {
          background-color: #9ca3af;
          cursor: not-allowed;
        }
        
        .status-message {
          margin-top: 1rem;
          padding: 0.75rem;
          border-radius: 0.375rem;
        }
        
        .status-success {
          background-color: #d1fae5;
          border: 1px solid #a7f3d0;
          color: #065f46;
        }
        
        .status-error {
          background-color: #fee2e2;
          border: 1px solid #fca5a5;
          color: #991b1b;
        }
        
        .form-title {
          margin-bottom: 1.5rem;
          font-size: 1.5rem;
          font-weight: 700;
          color: #111827;
        }
      \`}</style>
    </div>
  );
};

// Usage Examples:

// 1. Basic usage
/*
<JestyCRMForm />
*/

// 2. Customized usage
/*
<JestyCRMForm 
  formId="custom-contact-form"
  title="Get in Touch"
  submitText="Send Message"
  successMessage="Thanks! We'll get back to you soon."
  onSuccess={(result) => {
    console.log('Form submitted successfully:', result);
    // Additional success logic
  }}
  onError={(error) => {
    console.error('Form submission error:', error);
    // Additional error handling
  }}
/>
*/

export default JestyCRMForm;
    `.trim();
  }

  // Generate PHP integration code
  generatePHPCode(integration) {
    const integrationKey = integration.integrationKey;
    const webhookUrl = `${process.env.SERVICE_URL || 'http://localhost:3005'}/api/webhooks/website/${integrationKey}`;
    
    return `
<?php
// Jesty CRM Integration - PHP
// Integration: ${integration.name}

class JestyCRM {
    private $integrationKey = '${integrationKey}';
    private $webhookUrl = '${webhookUrl}';
    
    public function submitLead($data, $formId = 'contact-form') {
        $data['formId'] = $formId;
        $data['timestamp'] = date('c');
        
        $headers = array(
            'Content-Type: application/json',
            'X-Integration-Key: ' . $this->integrationKey,
            'X-Form-ID: ' . $formId
        );
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->webhookUrl);
        curl_setopt($ch, CURLOPT_POST, 1);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        
        return array('success' => ($httpCode === 200), 'response' => json_decode($response, true));
    }
    
    public function processForm() {
        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            $contact = $_POST['contact'] ?? '';
            $data = array(
                'name' => $_POST['name'] ?? '',
                'contact' => $contact
            );
            
            // Determine if contact is email or phone
            if (filter_var($contact, FILTER_VALIDATE_EMAIL)) {
                $data['email'] = $contact;
            } else {
                $data['phone'] = $contact;
            }
            
            return $this->submitLead($data);
        }
        return array('success' => false, 'message' => 'Invalid request');
    }
}

// Usage:
// $crm = new JestyCRM();
// $result = $crm->submitLead(array('name' => 'John', 'contact' => 'john@example.com'));
// Or: $result = $crm->submitLead(array('name' => 'John', 'contact' => '123-456-7890'));
?>
    `.trim();
  }

  // Generate WordPress plugin code - Generic customizable plugin
  generateWordPressCode(integration) {
    const integrationKey = integration.integrationKey;
    
    return `
<?php
/**
 * Plugin Name: Jesty CRM Integration
 * Description: Integrate your WordPress site with Jesty CRM
 * Version: 1.0.0
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class JestyCRMWordPress {
    private $integrationKey = '${integrationKey}';
    private $webhookUrl = '${process.env.SERVICE_URL || 'http://localhost:3005'}/api/webhooks/website/${integrationKey}';
    
    public function __construct() {
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        add_shortcode('jesty_form', array($this, 'render_form'));
        add_action('wp_ajax_jesty_submit', array($this, 'handle_form_submission'));
        add_action('wp_ajax_nopriv_jesty_submit', array($this, 'handle_form_submission'));
    }
    
    public function enqueue_scripts() {
        wp_enqueue_script('jquery');
        wp_localize_script('jquery', 'jesty_ajax', array(
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('jesty_nonce')
        ));
    }
    
    public function render_form($atts) {
        $atts = shortcode_atts(array(
            'type' => 'contact',
            'title' => 'Contact Us'
        ), $atts);
        
        ob_start();
        ?>
        <div class="jesty-form-container">
            <h3><?php echo esc_html($atts['title']); ?></h3>
            <form id="jesty-form" method="post">
                <?php wp_nonce_field('jesty_nonce', 'jesty_nonce'); ?>
                <input type="hidden" name="form_type" value="<?php echo esc_attr($atts['type']); ?>">
                
                <p>
                    <label for="jesty_name">Name *</label>
                    <input type="text" id="jesty_name" name="name" required>
                </p>
                
                <p>
                    <label for="jesty_email">Email *</label>
                    <input type="email" id="jesty_email" name="email" required>
                </p>
                
                <p>
                    <label for="jesty_phone">Phone</label>
                    <input type="tel" id="jesty_phone" name="phone">
                </p>
                
                <?php if ($atts['type'] === 'contact'): ?>
                <p>
                    <label for="jesty_company">Company</label>
                    <input type="text" id="jesty_company" name="company">
                </p>
                
                <p>
                    <label for="jesty_message">Message</label>
                    <textarea id="jesty_message" name="message" rows="5"></textarea>
                </p>
                <?php endif; ?>
                
                <p>
                    <button type="submit">Submit</button>
                </p>
            </form>
            
            <div id="jesty-message" style="display: none;"></div>
        </div>
        
        <script>
        jQuery(document).ready(function($) {
            $('#jesty-form').on('submit', function(e) {
                e.preventDefault();
                
                var formData = {
                    action: 'jesty_submit',
                    nonce: jesty_ajax.nonce,
                    form_data: $(this).serialize()
                };
                
                $.post(jesty_ajax.ajax_url, formData, function(response) {
                    if (response.success) {
                        $('#jesty-message').html('<p style="color: green;">' + response.data.message + '</p>').show();
                        $('#jesty-form')[0].reset();
                    } else {
                        $('#jesty-message').html('<p style="color: red;">Error: ' + response.data.message + '</p>').show();
                    }
                });
            });
        });
        </script>
        <?php
        return ob_get_clean();
    }
    
    public function handle_form_submission() {
        if (!wp_verify_nonce($_POST['nonce'], 'jesty_nonce')) {
            wp_die('Security check failed');
        }
        
        parse_str($_POST['form_data'], $form_data);
        
        $lead_data = array(
            'name' => sanitize_text_field($form_data['name']),
            'email' => sanitize_email($form_data['email']),
            'phone' => sanitize_text_field($form_data['phone']),
            'company' => sanitize_text_field($form_data['company']),
            'message' => sanitize_textarea_field($form_data['message']),
            'formId' => sanitize_text_field($form_data['form_type']) . '-form',
            'page' => get_permalink(),
            'referrer' => wp_get_referer()
        );
        
        $response = wp_remote_post($this->webhookUrl, array(
            'headers' => array(
                'Content-Type' => 'application/json',
                'X-Integration-Key' => $this->integrationKey,
                'X-Form-ID' => $lead_data['formId']
            ),
            'body' => wp_json_encode($lead_data),
            'timeout' => 30
        ));
        
        if (is_wp_error($response)) {
            wp_send_json_error(array('message' => 'Failed to submit form'));
        } else {
            $body = wp_remote_retrieve_body($response);
            $result = json_decode($body, true);
            
            if ($result['success']) {
                wp_send_json_success(array('message' => 'Thank you for your submission!'));
            } else {
                wp_send_json_error(array('message' => $result['message']));
            }
        }
    }
}

// Initialize the plugin
new JestyCRMWordPress();

// Usage: Add [jesty_form type="contact" title="Contact Us"] shortcode to any page or post
    `.trim();
  }

  // Generate cURL command examples - Generic templates
  generateCurlCode(integration) {
    const integrationKey = integration.integrationKey;
    const webhookUrl = `${process.env.SERVICE_URL || 'http://localhost:3005'}/api/webhooks/website/${integrationKey}`;
    
    return `
# Jesty CRM Generic cURL Examples
# Customize the JSON data with your specific fields

# Basic Lead Submission
curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Integration-Key: ${integrationKey}" \\
  -H "X-Form-ID: generic-form" \\
  -d '{
    "name": "John Smith",
    "email": "john.smith@example.com",
    "phone": "+1-555-123-4567",
    "company": "Example Corp",
    "message": "I am interested in your services",
    "formId": "generic-form",
    "page": "https://yoursite.com/contact",
    "referrer": "https://google.com"
  }'

# Extended Lead with Custom Fields
curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Integration-Key: ${integrationKey}" \\
  -H "X-Form-ID: detailed-form" \\
  -d '{
    "name": "Sarah Johnson",
    "email": "sarah@business.com",
    "phone": "+1-555-987-6543",
    "company": "Business Solutions Inc",
    "jobTitle": "Marketing Director",
    "industry": "Technology",
    "budget": "50000-100000",
    "timeline": "3-6 months",
    "message": "Looking for a comprehensive CRM solution",
    "source": "website",
    "utm_source": "google",
    "utm_medium": "cpc",
    "utm_campaign": "lead-generation",
    "formId": "detailed-form",
    "page": "https://yoursite.com/demo",
    "referrer": "https://google.com/search?q=crm+software"
  }'

# Minimal Lead (Only Required Fields)
curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Integration-Key: ${integrationKey}" \\
  -H "X-Form-ID: minimal-form" \\
  -d '{
    "name": "Mike Davis",
    "email": "mike@startup.com",
    "formId": "minimal-form"
  }'

# Newsletter Subscription Example
curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Integration-Key: ${integrationKey}" \\
  -H "X-Form-ID: newsletter" \\
  -d '{
    "name": "Emily Chen",
    "email": "emily@subscriber.com",
    "interests": "Product Updates, Industry News",
    "subscriptionType": "weekly",
    "formId": "newsletter",
    "page": "https://yoursite.com/newsletter"
  }'

# Event Registration Example
curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Integration-Key: ${integrationKey}" \\
  -H "X-Form-ID: event-registration" \\
  -d '{
    "name": "Alex Rodriguez",
    "email": "alex@company.com",
    "phone": "+1-555-111-2222",
    "company": "Tech Innovations",
    "jobTitle": "CEO",
    "eventName": "CRM Workshop 2025",
    "attendeeCount": "5",
    "dietaryRestrictions": "Vegetarian",
    "specialRequests": "Wheelchair accessible seating",
    "formId": "event-registration",
    "page": "https://yoursite.com/events/crm-workshop"
  }'

# Testing Commands:

# 1. Test webhook connectivity
curl -I "${webhookUrl}"

# 2. Test with minimal data
curl -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Integration-Key: ${integrationKey}" \\
  -H "X-Form-ID: test" \\
  -d '{"name":"Test User","email":"test@example.com","formId":"test"}'

# 3. Test with verbose output (for debugging)
curl -v -X POST "${webhookUrl}" \\
  -H "Content-Type: application/json" \\
  -H "X-Integration-Key: ${integrationKey}" \\
  -H "X-Form-ID: debug" \\
  -d '{"name":"Debug Test","email":"debug@example.com","formId":"debug"}'

# Notes:
# - Replace field values with your actual data
# - Add/remove fields as needed for your use case
# - The "formId" field helps identify different form types in your CRM
# - All fields except "name" and "email" are optional
# - Page and referrer fields are automatically captured in web forms
    `.trim();
  }
}

module.exports = new WebsiteService();
