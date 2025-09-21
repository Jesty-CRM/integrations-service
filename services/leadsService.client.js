const axios = require('axios');
const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

class LeadsServiceClient {
  constructor() {
    // Use environment variable or default to localhost for development
    this.baseURL = process.env.LEADS_SERVICE_URL || 'http://localhost:3002';
    this.adminToken = null; // Will be set dynamically when needed
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: 30000, // 30 seconds timeout
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'integrations-service/1.0.0'
      }
    });
  }

  /**
   * Set the admin JWT token for authentication
   * @param {string} token - JWT token from admin user
   */
  setAdminToken(token) {
    this.adminToken = token;
    logger.info('Admin token set for leads service client');
  }

  /**
   * Generate service-to-service JWT token
   * @param {string} organizationId - Organization ID
   * @returns {string} JWT token
   */
  generateServiceToken(organizationId) {
    const payload = {
      id: 'integrations-service',
      userId: 'integrations-service',
      type: 'access',
      email: 'service@integrations.jestycrm.com',
      roles: ['admin', 'service'],
      role: 'admin',
      organizationId: organizationId,
      permissions: [],
      service: 'integrations-service'
    };

    const token = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
      expiresIn: process.env.JWT_ACCESS_EXPIRY || '30d',
      audience: 'jesty-crm-users',
      issuer: 'jesty-crm'
    });

    return token;
  }

  /**
   * Get authentication headers - automatic for external lead sources
   * @param {string} organizationId - Organization ID
   * @param {boolean} isExternalSource - Whether this is from an external source (website, Facebook, etc.)
   * @returns {Object} Headers object
   */
  getAuthHeaders(organizationId, isExternalSource = false) {
    const headers = {};
    
    if (isExternalSource) {
      // For external sources (website, Facebook, etc.), use service-to-service authentication
      if (organizationId) {
        const serviceToken = this.generateServiceToken(organizationId);
        headers['Authorization'] = `Bearer ${serviceToken}`;
        headers['X-Source-Type'] = 'external';
        logger.info('Generated automatic service token for external source');
      }
    } else {
      // For internal/admin operations, use provided admin token
      if (this.adminToken) {
        headers['Authorization'] = `Bearer ${this.adminToken}`;
        logger.info('Using provided admin token for internal operation');
      } else {
        logger.warn('No admin token provided for internal operation');
      }
    }
    
    if (organizationId) {
      headers['X-Organization-Id'] = organizationId;
    }
    
    return headers;

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info(`Making request to leads-service: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('Request interceptor error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.info(`Leads-service response: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        logger.error(`Leads-service error: ${error.response?.status} ${error.response?.statusText}`, {
          url: error.config?.url,
          method: error.config?.method,
          data: error.response?.data
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Create a new lead in the leads-service
   * @param {Object} leadData - Lead information
   * @param {string} leadData.organizationId - Organization ID
   * @param {string} leadData.source - Lead source (website, facebook, shopify, etc.)
   * @param {string} leadData.name - Lead name
   * @param {string} leadData.email - Lead email
   * @param {string} [leadData.phone] - Lead phone
   * @param {Object} [leadData.customFields] - Custom fields
   * @param {Object} [leadData.metadata] - Additional metadata
   * @returns {Promise<Object>} Created lead data
   */
  async createLead(leadData) {
    try {
      logger.info('Creating lead in leads-service', { 
        source: leadData.source,
        email: leadData.email,
        organizationId: leadData.organizationId 
      });

      // Validate required fields
      if (!leadData.organizationId) {
        throw new Error('organizationId is required');
      }
      if (!leadData.source) {
        throw new Error('source is required');
      }
      if (!leadData.name) {
        throw new Error('name is required');
      }
      if (!leadData.email) {
        throw new Error('email is required');
      }

      // Prepare lead payload for leads-service
      const payload = {
        name: leadData.name,
        email: leadData.email,
        phone: leadData.phone || '',
        company: leadData.company || '',
        source: leadData.source,
        status: 'new',
        priority: leadData.priority || 'medium',
        organizationId: leadData.organizationId,
        customFields: leadData.customFields || {},
        metadata: {
          ...leadData.metadata,
          createdBy: 'integrations-service',
          createdAt: new Date().toISOString(),
          sourceDetails: {
            integration: leadData.source,
            originalData: leadData.originalData || {}
          }
        }
      };

      // Add organization ID to headers for service authentication
      const requestConfig = {
        headers: {
          'X-Organization-Id': leadData.organizationId
        }
      };

      const response = await this.client.post('/api/leads', payload, requestConfig);
      
      logger.info('Lead created successfully in leads-service', {
        leadId: response.data.lead?._id,
        source: leadData.source,
        email: leadData.email
      });

      return {
        success: true,
        lead: response.data.lead,
        message: 'Lead created successfully'
      };

    } catch (error) {
      logger.error('Failed to create lead in leads-service', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        source: leadData.source,
        email: leadData.email,
        stack: error.stack
      });

      throw new Error(`Failed to create lead: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Update an existing lead
   * @param {string} leadId - Lead ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated lead data
   */
  async updateLead(leadId, updateData) {
    try {
      logger.info('Updating lead in leads-service', { leadId });

      const response = await this.client.put(`/api/leads/${leadId}`, updateData);
      
      logger.info('Lead updated successfully in leads-service', { leadId });

      return {
        success: true,
        lead: response.data.lead,
        message: 'Lead updated successfully'
      };

    } catch (error) {
      logger.error('Failed to update lead in leads-service', {
        error: error.message,
        leadId,
        stack: error.stack
      });

      throw new Error(`Failed to update lead: ${error.message}`);
    }
  }

  /**
   * Check if leads-service is healthy
   * @returns {Promise<boolean>} Service health status
   */
  async checkHealth() {
    try {
      const response = await this.client.get('/health');
      return response.status === 200;
    } catch (error) {
      logger.error('Leads-service health check failed', { error: error.message });
      return false;
    }
  }

  /**
   * Create lead from website form submission
   * @param {Object} formData - Website form data
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Created lead
   */
  async createLeadFromWebsite(formData, organizationId) {
    try {
      logger.info('Creating website lead in leads-service', { 
        email: formData.email,
        organizationId: organizationId 
      });

      // Extract standard fields
      const standardFields = ['name', 'email', 'phone', 'company', 'message', 'source', 'formId', 'referrer', 'userAgent', 'ipAddress', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
      
      // Build custom fields from all non-standard fields
      const customFields = {};
      
      // Handle sourceDetails specially - convert to JSON string if it's an object
      if (formData.sourceDetails) {
        if (typeof formData.sourceDetails === 'object') {
          customFields.sourceDetails = JSON.stringify(formData.sourceDetails);
        } else {
          customFields.sourceDetails = formData.sourceDetails;
        }
      } else {
        // Create sourceDetails from tracking data
        customFields.sourceDetails = JSON.stringify({
          referrer: formData.referrer || '',
          userAgent: formData.userAgent || '',
          ipAddress: formData.ipAddress || '',
          formId: formData.formId || '',
          utm_source: formData.utm_source || '',
          utm_medium: formData.utm_medium || '',
          utm_campaign: formData.utm_campaign || '',
          utm_term: formData.utm_term || '',
          utm_content: formData.utm_content || '',
          originalSource: formData.source || 'website'
        });
      }

      // Process all fields from formData
      Object.keys(formData).forEach(key => {
        const value = formData[key];
        
        // Skip null, undefined, or empty string values
        if (value === null || value === undefined || value === '') {
          return;
        }
        
        // If it's not a standard field and not a tracking field and not sourceDetails, add it to customFields
        const trackingFields = ['referrer', 'userAgent', 'ipAddress', 'formId', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'source', 'sourceDetails'];
        if (!standardFields.includes(key) && !trackingFields.includes(key)) {
          customFields[key] = value;
        }
      });

      // Prepare website lead payload matching websiteLeadSchema
      const payload = {
        name: formData.name || formData.fullName || `${formData.firstName || ''} ${formData.lastName || ''}`.trim(),
        email: formData.email,
        sourceId: `website_${Date.now()}_${organizationId}`, // Generate website-specific sourceId
        extraFields: {
          // Only include fields that have non-empty values
          ...(formData.message || formData.subject ? { message: formData.message || formData.subject } : {}),
          ...(formData.company ? { company: formData.company } : {})
        },
        customFields: customFields // Pass all custom fields to the lead
      };

      // Only add website field if it has a non-empty value
      const websiteUrl = formData.websiteUrl || formData.referrer || '';
      if (websiteUrl && websiteUrl.trim()) {
        payload.extraFields.website = websiteUrl.trim();
      }

      // Only add optional fields if they have valid values
      if (formData.phone || formData.tel) {
        payload.phone = formData.phone || formData.tel;
      }

      // websiteUrl is now handled in extraFields above

      if (formData.integrationId) {
        payload.integrationId = formData.integrationId;
      }

      // Authentication headers using JWT token
      const requestConfig = {
        headers: this.getAuthHeaders(organizationId, true) // true = external source
      };

      logger.info('Sending website lead payload to leads-service', { 
        originalFormData: formData,
        payload, 
        headers: { 
          ...requestConfig.headers,
          Authorization: requestConfig.headers.Authorization ? '[HIDDEN]' : 'None'
        }
      });

      const response = await this.client.post('/api/website-leads', payload, requestConfig);
      
      logger.info('Website lead created successfully in leads-service', {
        responseData: response.data,
        leadId: response.data.data?._id,
        email: formData.email,
        success: response.data.success
      });

      const leadData = response.data.data; // The actual lead data is in response.data.data
      
      return {
        success: response.data.success,
        lead: leadData,
        message: response.data.message || 'Website lead created successfully'
      };

    } catch (error) {
      logger.error('Failed to create website lead in leads-service', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        email: formData.email,
        validationErrors: error.response?.data?.errors,
        stack: error.stack
      });

      const errorMessage = error.response?.data?.message || error.response?.data?.errors?.join(', ') || error.message;
      throw new Error(`Failed to create website lead: ${errorMessage}`);
    }
  }

  /**
   * Create lead from Facebook Lead Ads
   * @param {Object} fbLeadData - Facebook lead data
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Created lead
   */
  async createLeadFromFacebook(fbLeadData, organizationId) {
    const leadData = {
      organizationId,
      source: 'facebook',
      name: fbLeadData.full_name || `${fbLeadData.first_name || ''} ${fbLeadData.last_name || ''}`.trim(),
      email: fbLeadData.email,
      phone: fbLeadData.phone_number,
      customFields: {
        adId: fbLeadData.ad_id,
        adSetId: fbLeadData.adset_id,
        campaignId: fbLeadData.campaign_id,
        formId: fbLeadData.form_id
      },
      metadata: {
        leadgenId: fbLeadData.leadgen_id,
        pageId: fbLeadData.page_id,
        createdTime: fbLeadData.created_time,
        platform: fbLeadData.platform
      },
      originalData: fbLeadData
    };

    return await this.createLead(leadData);
  }

  /**
   * Check for duplicate leads
   * @param {Object} leadData - Lead data to check
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Array>} Array of duplicate leads
   */
  async findDuplicates(leadData, organizationId) {
    try {
      logger.info('Checking for duplicates in leads-service', {
        email: leadData.email,
        phone: leadData.phone,
        organizationId: organizationId
      });

      const queryParams = new URLSearchParams({
        email: leadData.email || '',
        phone: leadData.phone || '',
        name: leadData.name || '',
        company: leadData.company || ''
      });

      // Service-to-service authentication headers
      const requestConfig = {
        headers: {
          'X-Service-Auth': this.client.defaults.headers['X-Service-Auth'],
          'X-Organization-Id': organizationId
        }
      };

      const response = await this.client.get(`/api/leads/duplicate-check?${queryParams}`, requestConfig);

      logger.info('Duplicate check completed', {
        hasDuplicates: response.data.data?.hasDuplicates,
        count: response.data.data?.count,
        email: leadData.email
      });

      return response.data.data?.duplicates || [];
    } catch (error) {
      logger.error('Failed to check duplicates in leads-service', {
        error: error.message,
        email: leadData.email,
        organizationId: organizationId
      });
      // Return empty array if check fails to avoid blocking lead creation
      return [];
    }
  }

  /**
   * Create lead from Shopify customer
   * @param {Object} shopifyData - Shopify customer data
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} Created lead
   */
  async createLeadFromShopify(shopifyData, organizationId) {
    const leadData = {
      organizationId,
      source: 'shopify',
      name: `${shopifyData.first_name || ''} ${shopifyData.last_name || ''}`.trim() || shopifyData.email,
      email: shopifyData.email,
      phone: shopifyData.phone,
      customFields: {
        customerId: shopifyData.id,
        ordersCount: shopifyData.orders_count,
        totalSpent: shopifyData.total_spent,
        acceptsMarketing: shopifyData.accepts_marketing
      },
      metadata: {
        shopifyCustomerId: shopifyData.id,
        createdAt: shopifyData.created_at,
        updatedAt: shopifyData.updated_at,
        verifiedEmail: shopifyData.verified_email
      },
      originalData: shopifyData
    };

    return await this.createLead(leadData);
  }

  /**
   * Create LeadSource record
   * @param {Object} leadSourceData - LeadSource data
   * @returns {Promise<Object>} Created LeadSource
   */
  async createLeadSource(leadSourceData) {
    try {
      logger.info('Creating LeadSource in leads-service', {
        leadId: leadSourceData.leadId,
        source: leadSourceData.source,
        organizationId: leadSourceData.organizationId
      });

      // Authentication headers using JWT token
      const requestConfig = {
        headers: this.getAuthHeaders(leadSourceData.organizationId, true) // true = external source
      };

      const response = await this.client.post('/api/lead-sources', leadSourceData, requestConfig);

      logger.info('LeadSource created successfully in leads-service', {
        leadSourceId: response.data.data._id,
        leadId: leadSourceData.leadId
      });

      return response.data.data;
    } catch (error) {
      logger.error('Failed to create LeadSource in leads-service', {
        error: error.message,
        response: error.response?.data,
        leadSourceData: {
          leadId: leadSourceData.leadId,
          source: leadSourceData.source,
          organizationId: leadSourceData.organizationId
        }
      });
      throw error;
    }
  }

  /**
   * Find duplicate LeadSources
   * @param {string} organizationId - Organization ID
   * @param {string} email - Lead email
   * @param {string} phone - Lead phone
   * @returns {Promise<Array>} Array of duplicate LeadSources
   */
  async findDuplicateLeadSources(organizationId, email, phone) {
    try {
      const params = new URLSearchParams();
      if (email) params.append('email', email);
      if (phone) params.append('phone', phone);

      const response = await this.client.get(`/api/lead-sources/duplicates?${params.toString()}`, {
        headers: {
          'X-Service-Auth': this.client.defaults.headers['X-Service-Auth'],
          'X-Organization-Id': organizationId
        }
      });
      
      return response.data.data || [];
    } catch (error) {
      logger.error('Failed to find duplicate LeadSources in leads-service', {
        error: error.message,
        organizationId,
        email
      });
      
      return []; // Return empty array if service is unavailable
    }
  }
}

module.exports = new LeadsServiceClient();