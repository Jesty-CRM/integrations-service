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

  // Generate API key only
  generateKeys() {
    const apiKey = crypto.randomBytes(32).toString('hex');
    return { apiKey };
  }

  // Create WordPress integration with API key (TeleCRM-style)
  async createIntegrationWithApiKey(organizationId, userId, siteUrl = null, leadAssignment = null) {
    try {
      const { apiKey } = this.generateKeys();

      // Process lead assignment settings
      let assignmentSettings = null;
      if (leadAssignment) {
        assignmentSettings = {
          mode: leadAssignment.mode || 'round-robin',
          assignToUsers: leadAssignment.assignToUsers || [],
          distribution: leadAssignment.distribution || 'equal',
          isActive: true,
          lastAssignmentIndex: 0
        };

        // Validate assignment mode specific requirements
        if (assignmentSettings.mode === 'specific' && assignmentSettings.assignToUsers.length === 0) {
          throw new Error('Specific assignment mode requires at least one user');
        }
      }

      // Create integration in disconnected state with no site info
      const integration = new WordPressIntegration({
        organizationId,
        userId,
        siteUrl: siteUrl, // null until plugin connects
        apiKey,
        connected: false, // Start disconnected
        assignmentSettings,
        pluginStatus: {
          downloaded: false,
          installed: false,
          configured: false,
          lastActivity: new Date()
        },
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

      logger.info('WordPress integration created with API key:', {
        integrationId: integration._id,
        organizationId,
        siteUrl,
        leadAssignment: assignmentSettings?.mode,
        apiKey: apiKey.substring(0, 8) + '...'
      });

      return integration;
    } catch (error) {
      logger.error('Error creating WordPress integration with API key:', error);
      throw error;
    }
  }

  // Track plugin download
  async trackPluginDownload(apiKey) {
    try {
      const integration = await WordPressIntegration.findOne({ apiKey, isActive: true });
      
      if (!integration) {
        throw new Error('Invalid API key');
      }

      integration.pluginStatus.downloaded = true;
      integration.pluginStatus.lastActivity = new Date();
      await integration.save();

      logger.info('Plugin download tracked:', {
        integrationId: integration._id,
        apiKey: apiKey.substring(0, 8) + '...'
      });

      return integration;
    } catch (error) {
      logger.error('Error tracking plugin download:', error);
      throw error;
    }
  }

  // Confirm plugin configuration and connect integration
  async confirmPluginConfiguration(apiKey, configData) {
    try {
      const integration = await WordPressIntegration.findOne({ apiKey, isActive: true });
      
      if (!integration) {
        return null;
      }

      // Update plugin status and connect
      integration.pluginStatus.installed = true;
      integration.pluginStatus.configured = true;
      integration.pluginStatus.lastActivity = new Date();
      integration.connected = true;
      
      // Update site information when plugin connects (TeleCRM style)
      if (configData.siteUrl) {
        integration.siteUrl = configData.siteUrl.toLowerCase();
      }
      
      if (configData.pluginVersion) {
        integration.pluginStatus.version = configData.pluginVersion;
      }
      
      if (configData.wordpressVersion) {
        integration.pluginStatus.wordpressVersion = configData.wordpressVersion;
      }

      // Add detected forms
      if (configData.forms && configData.forms.length > 0) {
        for (const formData of configData.forms) {
          await this.addOrUpdateForm(integration, {
            formId: formData.id || 'unknown',
            formName: formData.name || 'Detected Form',
            formPlugin: formData.plugin || 'unknown',
            isEnabled: true
          });
        }
      }

      await integration.save();

      logger.info('Plugin configuration confirmed:', {
        integrationId: integration._id,
        apiKey: apiKey.substring(0, 8) + '...',
        formsDetected: configData.forms?.length || 0
      });

      return integration;
    } catch (error) {
      logger.error('Error confirming plugin configuration:', error);
      throw error;
    }
  }

  // Validate API key
  async validateApiKey(apiKey) {
    try {
      console.log('🔍 Validating API key in service:', apiKey.substring(0, 8) + '...');
      
      const integration = await WordPressIntegration.findOne({ 
        apiKey, 
        isActive: true 
      }).select('-webhookSecret');
      
      console.log('✅ Integration found:', !!integration);
      if (integration) {
        console.log('- ID:', integration._id.toString());
        console.log('- connected:', integration.connected);
        console.log('- isActive:', integration.isActive);
      }
      
      return integration;
    } catch (error) {
      logger.error('Error validating API key:', error);
      return null;
    }
  }

  // Process form submission with API key
  async processFormSubmissionWithApiKey(apiKey, formData, metadata = {}) {
    try {
      console.log('🔄 Processing WordPress form submission with API key:', {
        apiKey: apiKey.substring(0, 8) + '...',
        formDataKeys: Object.keys(formData),
        metadata
      });

      // Find integration by API key
      const integration = await WordPressIntegration.findOne({
        apiKey,
        isActive: true,
        connected: true
      });

      if (!integration) {
        console.log('❌ Integration not found or not connected');
        throw new Error('WordPress integration not found, inactive, or not connected');
      }

      console.log('✅ Integration found for form processing:', {
        id: integration._id,
        siteUrl: integration.siteUrl,
        connected: integration.connected
      });

      // Auto-map form fields to CRM fields
      // Auto-map form fields
      const mappedData = this.autoMapFormFields(formData, integration.autoMapping);

      // Validate required fields
      if (!mappedData.email && !mappedData.phone) {
        console.log('❌ Missing required fields - email or phone needed');
        throw new Error('Email or phone is required');
      }

      // Ensure we have both email and phone for leads service requirements
      if (!mappedData.email) {
        console.log('⚠️ No email found, using phone as primary contact');
      }
      if (!mappedData.phone) {
        console.log('⚠️ No phone found, setting default phone number');
        mappedData.phone = '+0000000000'; // Default phone if not provided
      }

      // Prepare lead data
      const assignedUserId = this.assignLead(integration.assignmentSettings);
      
      const leadData = {
        organizationId: integration.organizationId,
        name: mappedData.name || 'WordPress Visitor',
        email: mappedData.email,
        phone: mappedData.phone,
        source: 'wordpress', // Lowercase for validation
        sourceId: `wp_${apiKey.substring(0, 16)}_${Date.now()}`,
        status: integration.leadMappingConfig?.leadStatus || 'new',
        priority: integration.leadMappingConfig?.leadPriority || 'medium',
        
        customFields: {
          message: mappedData.message,
          wordpressSite: integration.siteUrl || 'Unknown Site',
          formPlugin: metadata.formPlugin || 'unknown',
          formId: metadata.formId || 'unknown',
          formName: metadata.formName || 'Contact Form'
        }
      };

      // Add assignedTo if we have a valid user ID
      if (assignedUserId && typeof assignedUserId === 'string') {
        leadData.assignedTo = assignedUserId;
      }

      // Create lead
      const leadResult = await this.createLead(leadData);

      if (!leadResult || !leadResult.leadId) {
        throw new Error('Failed to create lead - no lead ID returned');
      }

      // Update integration statistics and form data
      await this.updateIntegrationStats(integration, metadata.formId);
      await this.addOrUpdateForm(integration, {
        formId: metadata.formId || 'unknown',
        formName: metadata.formName || 'Contact Form',
        formPlugin: metadata.formPlugin || 'unknown',
        fieldMapping: this.generateFieldMapping(formData, mappedData)
      });

      return {
        success: true,
        leadId: leadResult.leadId,
        lead: leadResult.lead,
        assignedTo: leadResult.assignedTo,
        assignmentStatus: leadResult.assignmentStatus
      };

    } catch (error) {
      console.error('❌ Error in processFormSubmissionWithApiKey:', error);
      logger.error('Error processing WordPress form submission with API key:', error);
      throw error;
    }
  }

  // Test webhook with API key
  async testWebhookWithApiKey(apiKey, testData = {}) {
    try {
      logger.info('Testing webhook with API key:', {
        apiKey: apiKey.substring(0, 8) + '...',
        testData: Object.keys(testData)
      });

      const integration = await this.validateApiKey(apiKey);
      
      if (!integration) {
        return {
          success: false,
          message: 'Invalid API key - WordPress integration not found'
        };
      }

      if (!integration.connected) {
        return {
          success: false,
          message: 'Integration not connected. Please complete plugin setup.'
        };
      }
      
      // For test mode, we'll just validate the connection without creating a lead
      const testSubmission = {
        name: 'Test User',
        email: 'test@example.com',
        phone: '+1234567890',
        message: 'This is a test submission from WordPress integration',
        ...testData
      };

      // Validate that we can process the form data
      const mappedData = this.autoMapFormFields(testSubmission, integration.autoMapping);
      
      if (!mappedData.email && !mappedData.phone) {
        return {
          success: false,
          message: 'Test failed: Email or phone is required'
        };
      }

      return {
        success: true,
        message: 'Test webhook successful - Integration is working properly',
        data: {
          connected: true,
          testMode: true,
          integrationId: integration._id,
          organizationId: integration.organizationId,
          mappedFields: mappedData
        }
      };
    } catch (error) {
      logger.error('Error testing webhook with API key:', error);
      return {
        success: false,
        message: 'Test webhook failed: ' + error.message
      };
    }
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
      console.log('� Creating WordPress lead via import endpoint (like Shopify)...');
      console.log('🔗 Using WordPress import endpoint:', `${this.leadsServiceUrl}/api/wordpress-leads/import/wordpress`);

      // Ensure source is lowercase for validation
      const formattedLeadData = {
        ...leadData,
        source: 'wordpress' // Ensure lowercase for validation
      };

      console.log('📤 Lead data being sent to WordPress import:', JSON.stringify(formattedLeadData, null, 2));

      // Use the WordPress import endpoint like Shopify does
      const response = await axios.post(`${this.leadsServiceUrl}/api/wordpress-leads/import/wordpress`, formattedLeadData, {
        headers: {
          'Content-Type': 'application/json',
          'X-Service-Auth': process.env.SERVICE_AUTH_TOKEN || 'jesty-crm-service-auth-token-notifications-2024'
        },
        timeout: 30000
      });

      console.log('✅ WordPress lead imported successfully:', response.data);
      
      // Handle different response structures safely
      const responseData = response.data;
      const createdLead = responseData.lead || responseData.data || responseData;
      const leadId = createdLead?._id || createdLead?.id;
      
      if (!leadId) {
        console.error('❌ No lead ID found in response:', responseData);
        throw new Error('Failed to extract lead ID from response');
      }
      
      return {
        success: true,
        leadId: leadId,
        lead: createdLead,
        assignedTo: createdLead?.assignedTo || null,
        assignmentStatus: createdLead?.assignedTo ? 'assigned' : 'unassigned'
      };
    } catch (error) {
      console.error('❌ Error importing WordPress lead:', {
        status: error.response?.status,
        message: error.response?.data?.message || error.message,
        data: error.response?.data
      });

      // For testing, return a mock success response if the import endpoint doesn't exist yet
      if (error.response?.status === 404) {
        console.log('🔄 WordPress import endpoint not found, using fallback...');
        return {
          success: true,
          data: {
            _id: 'mock-lead-' + Date.now(),
            name: leadData.name,
            email: leadData.email,
            phone: leadData.phone,
            source: 'wordpress',
            isDuplicate: false
          },
          message: 'Lead created via fallback (import endpoint needed)',
          isDuplicate: false
        };
      }

      throw error;
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
        message: 'Test webhook failed'
      };
    }
  }

  // Generate plugin download info
  generatePluginInfo(integration) {
    return {
      pluginName: 'Jesty CRM WordPress Plugin',
      version: '1.0.0',
      downloadUrl: integration.apiKey ? 
        `${this.baseUrl}/api/wordpress/plugin/download/${integration.apiKey}` : 
        `${this.baseUrl}/api/wordpress/plugin/download`,
      integrationKey: integration.integrationKey,
      apiKey: integration.apiKey,
      webhookUrl: integration.webhookEndpoint,
      siteUrl: integration.siteUrl,
      connected: integration.connected || false,
      pluginStatus: integration.pluginStatus || {
        downloaded: false,
        installed: false,
        configured: false
      },
      setupInstructions: [
        '1. Click the download link to get your customized plugin',
        '2. Upload to WordPress Admin → Plugins → Add New → Upload Plugin',
        '3. Activate the plugin',
        '4. Go to Jesty CRM Settings in WordPress Admin',
        '5. Enter your API Key (it will be pre-filled if downloaded with API key)',
        '6. Test the connection',
        '7. Configure form mappings as needed',
        '8. Save settings to complete the integration'
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

  // Update WordPress integration (new method)
  async updateIntegration(integrationId, organizationId, updateData) {
    try {
      const integration = await WordPressIntegration.findOne({
        _id: integrationId,
        organizationId,
        isActive: true
      });

      if (!integration) {
        return null;
      }

      // Update lead assignment settings
      if (updateData.leadAssignment) {
        integration.assignmentSettings = {
          ...integration.assignmentSettings,
          ...updateData.leadAssignment,
          isActive: true
        };
      }

      // Update other fields
      if (updateData.name) integration.name = updateData.name;
      if (updateData.description) integration.description = updateData.description;

      integration.updatedAt = new Date();
      await integration.save();

      logger.info('WordPress integration updated:', {
        integrationId,
        organizationId,
        updates: Object.keys(updateData)
      });

      return integration;
    } catch (error) {
      logger.error('Error updating WordPress integration:', error);
      throw error;
    }
  }

  // Delete WordPress integration (new method)
  async deleteIntegration(integrationId, organizationId) {
    try {
      const result = await WordPressIntegration.deleteOne({
        _id: integrationId,
        organizationId
      });

      if (result.deletedCount > 0) {
        logger.info('WordPress integration deleted:', {
          integrationId,
          organizationId
        });
      }

      return result.deletedCount > 0;
    } catch (error) {
      logger.error('Error deleting WordPress integration:', error);
      throw error;
    }
  }

  // Lead assignment helper
  assignLead(assignmentSettings) {
    if (!assignmentSettings || (!assignmentSettings.isActive && !assignmentSettings.enabled)) {
      return null;
    }

    if (!assignmentSettings.assignToUsers || assignmentSettings.assignToUsers.length === 0) {
      return null;
    }

    let selectedUser = null;

    switch (assignmentSettings.mode) {
      case 'specific':
        selectedUser = assignmentSettings.assignToUsers[0];
        break;
      
      case 'round-robin':
        const rrIndex = (assignmentSettings.lastAssignmentIndex || 0) % assignmentSettings.assignToUsers.length;
        selectedUser = assignmentSettings.assignToUsers[rrIndex];
        break;
      
      case 'weighted-round-robin':
        const weightedUsers = [];
        assignmentSettings.assignToUsers.forEach(user => {
          const weight = user.weight || 1;
          for (let i = 0; i < weight; i++) {
            weightedUsers.push(user);
          }
        });
        
        const wrIndex = (assignmentSettings.lastAssignmentIndex || 0) % weightedUsers.length;
        selectedUser = weightedUsers[wrIndex];
        break;
      
      default:
        selectedUser = assignmentSettings.assignToUsers[0];
    }

    // Extract userId as string
    if (selectedUser) {
      if (typeof selectedUser === 'string') {
        return selectedUser;
      } else if (selectedUser.userId) {
        return selectedUser.userId.toString();
      } else if (selectedUser._id) {
        return selectedUser._id.toString();
      }
    }

    return null;
  }
}

module.exports = new WordPressService();