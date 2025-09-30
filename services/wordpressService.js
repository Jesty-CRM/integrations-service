const axios = require('axios');
const crypto = require('crypto');
const WordPressIntegration = require('../models/WordPressIntegration');
const WordPressPluginGenerator = require('./wordpressPluginGenerator');
const logger = require('../utils/logger');

class WordPressService {
  constructor() {
    this.leadsServiceUrl = process.env.LEADS_SERVICE_URL || 'http://localhost:3002';
    this.baseUrl = process.env.INTEGRATIONS_SERVICE_URL || 'http://localhost:3005';
  }

  // Generate integration key and API key
  generateKeys() {
    const integrationKey = `wp_${crypto.randomBytes(16).toString('hex')}`;
    const apiKey = crypto.randomBytes(32).toString('hex');
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    
    return { integrationKey, apiKey, webhookSecret };
  }

  // Create WordPress integration
  async createIntegration(organizationId, userId, siteUrl, siteName = '') {
    try {
      // Check if integration already exists for this site
      const existingIntegration = await WordPressIntegration.findOne({
        organizationId,
        siteUrl: siteUrl.toLowerCase()
      });

      if (existingIntegration) {
        throw new Error('Integration already exists for this WordPress site');
      }

      const { integrationKey, apiKey, webhookSecret } = this.generateKeys();
      const webhookEndpoint = `${this.baseUrl}/api/wordpress/webhook/${integrationKey}`;

      // Create integration
      const integration = new WordPressIntegration({
        organizationId,
        userId,
        siteUrl: siteUrl.toLowerCase(),
        siteName,
        integrationKey,
        apiKey,
        webhookSecret,
        webhookEndpoint,
        autoMapping: {
          enabled: true,
          nameFields: ['name', 'full_name', 'your_name', 'first_name', 'fname', 'contact_name'],
          emailFields: ['email', 'your_email', 'email_address', 'contact_email', 'user_email'],
          phoneFields: ['phone', 'your_phone', 'phone_number', 'contact_phone', 'mobile', 'tel'],
          companyFields: ['company', 'company_name', 'organization', 'business_name'],
          messageFields: ['message', 'your_message', 'comments', 'description', 'inquiry']
        }
      });

      await integration.save();

      logger.info('WordPress integration created:', {
        integrationId: integration._id,
        organizationId,
        siteUrl,
        integrationKey
      });

      return integration;
    } catch (error) {
      logger.error('Error creating WordPress integration:', error);
      throw error;
    }
  }

  // Process WordPress form submission
  async processFormSubmission(integrationKey, formData, metadata = {}) {
    try {
      logger.info('Processing WordPress form submission:', {
        integrationKey,
        formData,
        metadata
      });

      // Find integration
      const integration = await WordPressIntegration.findOne({
        integrationKey,
        isActive: true
      });

      if (!integration) {
        throw new Error('WordPress integration not found or inactive');
      }

      // Auto-map form fields to CRM fields
      const mappedData = this.autoMapFormFields(formData, integration.autoMapping);

      // Validate required fields
      if (!mappedData.email && !mappedData.phone) {
        throw new Error('Email or phone is required');
      }

      // Prepare lead data
      const leadData = {
        organizationId: integration.organizationId,
        name: mappedData.name || 'WordPress Visitor',
        email: mappedData.email,
        phone: mappedData.phone,
        source: 'WordPress',
        sourceId: `wp_${integrationKey}_${Date.now()}`,
        status: integration.leadMappingConfig?.leadStatus || 'new',
        priority: integration.leadMappingConfig?.leadPriority || 'medium',
        assignedTo: this.getAssignedUser(integration),
        
        customFields: {
          company: mappedData.company,
          message: mappedData.message,
          wordpressSite: integration.siteUrl,
          formPlugin: metadata.formPlugin || 'unknown',
          formId: metadata.formId || 'unknown',
          formName: metadata.formName || 'Contact Form',
          submissionDate: new Date().toISOString(),
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          pageUrl: metadata.pageUrl,
          referrer: metadata.referrer,
          ...mappedData.customFields // Additional custom fields
        },

        sourceDetails: {
          integrationId: integration._id,
          integrationKey: integrationKey,
          siteUrl: integration.siteUrl,
          siteName: integration.siteName,
          formId: metadata.formId,
          formName: metadata.formName,
          formPlugin: metadata.formPlugin,
          pageUrl: metadata.pageUrl,
          submissionId: metadata.submissionId
        },

        tags: [
          { name: 'wordpress', color: '#21759B' },
          { name: `wp-${integration.siteName || 'site'}`, color: '#464646' },
          { name: metadata.formPlugin || 'form', color: '#FF6900' }
        ]
      };

      // Create lead
      const leadResult = await this.createLead(leadData);

      // Update integration statistics
      await this.updateIntegrationStats(integration, metadata.formId);

      // Add to form if not exists
      await this.addOrUpdateForm(integration, {
        formId: metadata.formId || 'unknown',
        formName: metadata.formName || 'Contact Form',
        formPlugin: metadata.formPlugin || 'unknown',
        fieldMapping: this.generateFieldMapping(formData, mappedData)
      });

      logger.info('WordPress lead created successfully:', {
        leadId: leadResult.data?._id,
        email: leadData.email,
        integrationKey
      });

      return {
        success: true,
        leadId: leadResult.data?._id,
        leadData: leadData,
        mappedFields: mappedData
      };

    } catch (error) {
      logger.error('Error processing WordPress form submission:', error);
      throw error;
    }
  }

  // Auto-map WordPress form fields to CRM fields
  autoMapFormFields(formData, autoMapping) {
    const mappedData = {
      customFields: {}
    };

    // Helper function to find field by variations
    const findField = (fieldVariations, data) => {
      for (const variation of fieldVariations) {
        const value = data[variation];
        if (value && typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
      return null;
    };

    // Map standard fields
    if (autoMapping.enabled) {
      mappedData.name = findField(autoMapping.nameFields, formData);
      mappedData.email = findField(autoMapping.emailFields, formData);
      mappedData.phone = findField(autoMapping.phoneFields, formData);
      mappedData.company = findField(autoMapping.companyFields, formData);
      mappedData.message = findField(autoMapping.messageFields, formData);
    }

    // Map any remaining fields as custom fields
    const standardFields = ['name', 'email', 'phone', 'company', 'message'];
    const allMappedFields = [
      ...autoMapping.nameFields,
      ...autoMapping.emailFields,
      ...autoMapping.phoneFields,
      ...autoMapping.companyFields,
      ...autoMapping.messageFields
    ];

    Object.keys(formData).forEach(key => {
      if (!allMappedFields.includes(key) && formData[key]) {
        mappedData.customFields[key] = formData[key];
      }
    });

    return mappedData;
  }

  // Generate field mapping for form configuration
  generateFieldMapping(originalData, mappedData) {
    const fieldMapping = [];

    Object.keys(originalData).forEach(wpField => {
      const value = originalData[wpField];
      let crmField = 'custom';
      let isRequired = false;

      // Determine CRM field based on mapped data
      if (mappedData.name === value) crmField = 'name';
      else if (mappedData.email === value) { crmField = 'email'; isRequired = true; }
      else if (mappedData.phone === value) crmField = 'phone';
      else if (mappedData.company === value) crmField = 'company';
      else if (mappedData.message === value) crmField = 'message';

      fieldMapping.push({
        wpField,
        crmField,
        isRequired,
        fieldType: this.detectFieldType(wpField, value)
      });
    });

    return fieldMapping;
  }

  // Detect field type based on field name and value
  detectFieldType(fieldName, value) {
    const name = fieldName.toLowerCase();
    
    if (name.includes('email')) return 'email';
    if (name.includes('phone') || name.includes('tel') || name.includes('mobile')) return 'phone';
    if (name.includes('message') || name.includes('comment') || name.includes('description')) return 'textarea';
    if (name.includes('url') || name.includes('website')) return 'url';
    if (name.includes('date')) return 'date';
    if (name.includes('number') || name.includes('age')) return 'number';
    
    // Check value length for textarea
    if (typeof value === 'string' && value.length > 100) return 'textarea';
    
    return 'text';
  }

  // Get assigned user based on integration settings
  getAssignedUser(integration) {
    if (!integration.assignmentSettings || !integration.assignmentSettings.enabled) {
      return integration.leadMappingConfig?.autoAssignment?.assignToUser || null;
    }

    const { mode, assignToUsers } = integration.assignmentSettings;

    switch (mode) {
      case 'specific':
        if (assignToUsers && assignToUsers.length > 0) {
          return assignToUsers[0].userId;
        }
        break;
      case 'round-robin':
        return this.getRoundRobinUser(integration);
      case 'weighted-round-robin':
        return this.getWeightedRoundRobinUser(integration);
      default:
        return null;
    }
  }

  // Round-robin assignment
  getRoundRobinUser(integration) {
    const { assignToUsers } = integration.assignmentSettings;
    if (!assignToUsers || assignToUsers.length === 0) return null;

    const currentIndex = (integration.assignmentSettings.lastAssignmentIndex || 0) % assignToUsers.length;
    const selectedUser = assignToUsers[currentIndex];
    
    // Update assignment index (don't await to avoid blocking)
    this.updateAssignmentIndex(integration._id, (currentIndex + 1) % assignToUsers.length);
    
    return selectedUser.userId;
  }

  // Weighted round-robin assignment
  getWeightedRoundRobinUser(integration) {
    const { assignToUsers } = integration.assignmentSettings;
    if (!assignToUsers || assignToUsers.length === 0) return null;

    // Create weighted array
    const weightedUsers = [];
    assignToUsers.forEach(user => {
      const weight = user.weight || 1;
      for (let i = 0; i < weight; i++) {
        weightedUsers.push(user);
      }
    });

    const currentIndex = (integration.assignmentSettings.lastAssignmentIndex || 0) % weightedUsers.length;
    const selectedUser = weightedUsers[currentIndex];
    
    // Update assignment index (don't await to avoid blocking)
    this.updateAssignmentIndex(integration._id, (currentIndex + 1) % weightedUsers.length);
    
    return selectedUser.userId;
  }

  // Update assignment index (non-blocking)
  async updateAssignmentIndex(integrationId, newIndex) {
    try {
      await WordPressIntegration.findByIdAndUpdate(integrationId, {
        'assignmentSettings.lastAssignmentIndex': newIndex
      });
    } catch (error) {
      logger.error('Error updating assignment index:', error);
    }
  }

  // Create lead in CRM
  async createLead(leadData) {
    try {
      const response = await axios.post(`${this.leadsServiceUrl}/api/website-leads/import/wordpress`, leadData, {
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Auth': process.env.SERVICE_AUTH_TOKEN || 'integrations-service-auth-token'
        },
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      logger.error('Error creating lead in CRM:', error);
      throw new Error(`Failed to create lead: ${error.response?.data?.message || error.message}`);
    }
  }

  // Update integration statistics
  async updateIntegrationStats(integration, formId) {
    try {
      integration.statistics.totalFormSubmissions += 1;
      integration.statistics.totalLeadsCreated += 1;
      integration.statistics.lastSubmissionReceived = new Date();
      integration.statistics.lastLeadCreated = new Date();

      // Update form breakdown
      if (formId) {
        const currentCount = integration.statistics.formBreakdown.get(formId) || 0;
        integration.statistics.formBreakdown.set(formId, currentCount + 1);
      }

      await integration.save();
    } catch (error) {
      logger.error('Error updating integration stats:', error);
    }
  }

  // Add or update form in integration
  async addOrUpdateForm(integration, formData) {
    try {
      const existingForm = integration.forms.find(f => f.formId === formData.formId);
      
      if (existingForm) {
        existingForm.lastSubmission = new Date();
        existingForm.totalSubmissions += 1;
        if (formData.fieldMapping) {
          existingForm.fieldMapping = formData.fieldMapping;
        }
      } else {
        integration.forms.push({
          ...formData,
          lastSubmission: new Date(),
          totalSubmissions: 1
        });
        integration.statistics.totalForms = integration.forms.length;
      }

      await integration.save();
    } catch (error) {
      logger.error('Error adding/updating form:', error);
    }
  }

  // Get integration details
  async getIntegration(integrationKey) {
    try {
      const integration = await WordPressIntegration.findOne({
        integrationKey,
        isActive: true
      });

      if (!integration) {
        throw new Error('Integration not found');
      }

      return integration;
    } catch (error) {
      logger.error('Error getting integration:', error);
      throw error;
    }
  }

  // Get integrations for organization
  async getIntegrationsByOrganization(organizationId) {
    try {
      const integrations = await WordPressIntegration.find({
        organizationId,
        isActive: true
      }).select('-apiKey -webhookSecret');

      return integrations;
    } catch (error) {
      logger.error('Error getting integrations by organization:', error);
      throw error;
    }
  }

  // Update integration settings
  async updateIntegration(integrationId, updateData) {
    try {
      const integration = await WordPressIntegration.findByIdAndUpdate(
        integrationId,
        { ...updateData, updatedAt: new Date() },
        { new: true }
      );

      if (!integration) {
        throw new Error('Integration not found');
      }

      return integration;
    } catch (error) {
      logger.error('Error updating integration:', error);
      throw error;
    }
  }

  // Test webhook connectivity
  async testWebhook(integrationKey, testData = {}) {
    try {
      const integration = await this.getIntegration(integrationKey);
      
      const testSubmission = {
        name: 'Test User',
        email: 'test@example.com',
        phone: '+1234567890',
        message: 'This is a test submission from WordPress integration',
        ...testData
      };

      const result = await this.processFormSubmission(integrationKey, testSubmission, {
        formId: 'test-form',
        formName: 'Test Form',
        formPlugin: 'test',
        pageUrl: integration.siteUrl,
        ipAddress: '127.0.0.1',
        userAgent: 'WordPress Integration Test'
      });

      return {
        success: true,
        message: 'Test webhook successful',
        result
      };
    } catch (error) {
      logger.error('Error testing webhook:', error);
      return {
        success: false,
        message: 'Test webhook failed',
        error: error.message
      };
    }
  }

  // Generate plugin download info
  generatePluginInfo(integration) {
    return {
      pluginName: 'Jesty CRM WordPress Plugin',
      version: '1.0.0',
      downloadUrl: `${this.baseUrl}/api/wordpress/plugin/download`,
      integrationKey: integration.integrationKey,
      apiKey: integration.apiKey,
      webhookUrl: integration.webhookEndpoint,
      siteUrl: integration.siteUrl,
      setupInstructions: [
        '1. Download the plugin ZIP file',
        '2. Upload to WordPress Admin → Plugins → Add New → Upload Plugin',
        '3. Activate the plugin',
        '4. Go to CRM Settings in WordPress Admin',
        '5. Enter your Integration Key and API Key',
        '6. Test the connection',
        '7. Configure form mappings as needed'
      ]
    };
  }

  // Generate plugin information and download
  generatePluginInfo(integration) {
    return WordPressPluginGenerator.generatePluginInfo(integration);
  }

  async generatePluginZip(integration) {
    try {
      return await WordPressPluginGenerator.generatePluginZip(integration);
    } catch (error) {
      logger.error('Error generating WordPress plugin ZIP:', error);
      throw new Error('Failed to generate plugin ZIP file');
    }
  }
}

module.exports = new WordPressService();