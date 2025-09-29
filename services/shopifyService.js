const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const ShopifyIntegration = require('../models/ShopifyIntegration');

class ShopifyService {
  constructor() {
    this.leadsServiceUrl = process.env.LEADS_SERVICE_URL || 'http://localhost:3002';
  }

  // Main webhook handler - entry point for webhook routes
  async handleWebhook(payload, headers = {}) {
    try {
      logger.info('Shopify webhook received:', {
        hasPayload: !!payload,
        headers: Object.keys(headers),
        organizationId: headers['x-organization-id']
      });

      // Extract organization ID from headers (set by route) or try to find from payload
      const organizationId = headers['x-organization-id'];
      
      // Extract topic from headers (Shopify sends this as X-Shopify-Topic)
      const topic = headers['x-shopify-topic'] || headers['X-Shopify-Topic'] || 'unknown';
      
      if (organizationId) {
        // Process with specific organization context
        return await this.processWebhook(organizationId, topic, payload, headers);
      } else {
        // Handle as generic webhook (backward compatibility)
        return await this.handleGenericWebhook(payload, topic);
      }
    } catch (error) {
      logger.error('Webhook handling error:', error);
      throw error;
    }
  }

  // Main webhook processor with organization context and assignment settings
  async processWebhook(organizationId, topic, payload, headers) {
    try {
      logger.info('Processing Shopify webhook:', {
        organizationId,
        topic,
        hasPayload: !!payload
      });

      // Get integration configuration for this organization
      const integration = await ShopifyIntegration.findOne({ 
        organizationId,
        isActive: true 
      });

      if (!integration) {
        logger.warn('No active integration found for organization:', organizationId);
        return { 
          success: false, 
          error: 'No active integration found for this organization' 
        };
      }

      // Auto-register event type if not already registered
      await this.autoRegisterEventType(integration, topic);

      // Process webhook based on topic
      let result;
      switch (topic) {
        case 'orders/create':
        case 'orders/paid':
        case 'orders/updated':
          result = await this.processOrderWebhook(payload, integration, topic);
          break;
        case 'customers/create':
        case 'customers/update':
          result = await this.processCustomerWebhook(payload, integration, topic);
          break;
        case 'checkouts/create':
        case 'checkouts/update':
        case 'carts/create':
        case 'carts/update':
          result = await this.processCheckoutWebhook(payload, integration, topic);
          break;
        default:
          result = await this.handleGenericWebhookWithIntegration(topic, payload, integration);
          break;
      }

      // Update statistics
      await this.updateWebhookStatistics(integration, topic, result.success);

      return result;
    } catch (error) {
      logger.error('Error processing webhook:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(rawBody, signature, organizationId) {
    // For now, we'll skip signature verification in development
    // In production, you should implement proper HMAC verification
    return true;
  }

  // Process order webhooks with integration settings
  async processOrderWebhook(payload, integration, eventType) {
    try {
      const leadType = this.determineOrderLeadType(payload, eventType);
      const assignedTo = this.getAssignedUser(integration);
      const leadData = this.createLeadFromOrder(payload, leadType, integration, assignedTo);
      
      const result = await this.createOrUpdateLead(leadData);
      
      logger.info('Order webhook processed successfully:', {
        eventType,
        leadId: result.data?._id,
        assignedTo: assignedTo
      });
      
      return { 
        success: true, 
        type: eventType,
        leadId: result.data?._id,
        assignedTo: assignedTo
      };
    } catch (error) {
      logger.error('Error processing order webhook:', error);
      return { success: false, error: error.message };
    }
  }

  // Process customer webhooks with integration settings
  async processCustomerWebhook(payload, integration, eventType) {
    try {
      const leadType = eventType === 'customers/create' ? 'new-customer' : 'updated-customer';
      const assignedTo = this.getAssignedUser(integration);
      const leadData = this.createLeadFromCustomer(payload, leadType, integration, assignedTo);
      
      const result = await this.createOrUpdateLead(leadData);
      
      logger.info('Customer webhook processed successfully:', {
        eventType,
        leadId: result.data?._id,
        assignedTo: assignedTo
      });
      
      return { 
        success: true, 
        type: eventType,
        leadId: result.data?._id,
        assignedTo: assignedTo
      };
    } catch (error) {
      logger.error('Error processing customer webhook:', error);
      return { success: false, error: error.message };
    }
  }

  // Process checkout/cart webhooks with integration settings
  async processCheckoutWebhook(payload, integration, eventType) {
    try {
      const leadType = payload.abandoned_checkout_url ? 'abandoned-cart' : 'cart-recovery';
      const assignedTo = this.getAssignedUser(integration);
      const leadData = this.createLeadFromCheckout(payload, leadType, integration, assignedTo);
      
      const result = await this.createOrUpdateLead(leadData);
      
      logger.info('Checkout webhook processed successfully:', {
        eventType,
        leadId: result.data?._id,
        assignedTo: assignedTo
      });
      
      return { 
        success: true, 
        type: eventType,
        leadId: result.data?._id,
        assignedTo: assignedTo
      };
    } catch (error) {
      logger.error('Error processing checkout webhook:', error);
      return { success: false, error: error.message };
    }
  }

  // Determine lead type for orders
  determineOrderLeadType(orderData, eventType) {
    if (eventType === 'orders/paid') return 'confirmed-sale';
    if (eventType === 'orders/updated') return 'updated-order';
    return 'hot-lead'; // for orders/create
  }

  async createOrUpdateLead(leadData) {
    try {
      logger.info('Creating lead in CRM:', {
        email: leadData.email,
        name: leadData.name,
        source: leadData.source,
        assignedTo: leadData.assignedTo
      });

      // Log the full lead data being sent for debugging
      logger.info('Full lead data being sent:', JSON.stringify(leadData, null, 2));

      // Use the new Shopify import endpoint (no auth required)
      const response = await axios.post(`${process.env.LEADS_SERVICE_URL}/api/shopify-leads/import/shopify`, leadData, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      logger.info('Lead created successfully via Shopify import endpoint:', {
        leadId: response.data.data?._id,
        email: leadData.email,
        assignedTo: leadData.assignedTo
      });

      return response.data;
    } catch (error) {
      logger.error('Error creating/updating lead via leads service:', {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data,
        requestData: {
          organizationId: leadData.organizationId,
          email: leadData.email,
          name: leadData.name,
          assignedTo: leadData.assignedTo
        }
      });
      
      // Re-throw with more details
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message;
      throw new Error(`Leads service error (${error.response?.status}): ${errorMessage}`);
    }
  }

  // Verify webhook authenticity
  verifyWebhook(rawBody, signature, secret) {
    const calculatedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('base64');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(calculatedSignature)
    );
  }

  // Generic webhook handler for unknown types (backward compatibility)
  async handleGenericWebhook(payload, eventType = 'unknown') {
    logger.info(`Processing generic webhook for event type: ${eventType}`);
    
    // For backward compatibility with existing calls that don't pass integration
    // We'll create a default integration object
    const defaultIntegration = {
      organizationId: '507f1f77bcf86cd799439011',
      leadMappingConfig: {
        leadSource: 'shopify',
        leadStatus: 'new'
      },
      assignmentSettings: {
        enabled: false,
        mode: 'auto'
      }
    };
    
    return this.handleGenericWebhookWithIntegration(eventType, payload, defaultIntegration);
  }

  // Handle generic webhook events with integration settings
  async handleGenericWebhookWithIntegration(eventType, payload, integration) {
    logger.info(`Processing generic webhook for event type: ${eventType}`);
    
    // Get assignment from integration settings
    const assignedTo = this.getAssignedUser(integration);
    
    // Try to extract meaningful data from any payload structure
    let leadData = null;
    let leadType = 'generic-shopify-event';
    
    // Check if it looks like an order
    if (payload.line_items && payload.total_price) {
      leadData = this.createLeadFromOrder(payload, 'generic-order', integration, assignedTo);
      leadType = 'order';
    }
    // Check if it looks like a customer
    else if (payload.default_address && payload.email && !payload.line_items) {
      leadData = this.createLeadFromCustomer(payload, 'generic-customer', integration, assignedTo);
      leadType = 'customer';
    }
    // Check if it looks like a checkout/cart
    else if (payload.abandoned_checkout_url || payload.cart_token) {
      leadData = this.createLeadFromCheckout(payload, 'generic-checkout', integration, assignedTo);
      leadType = 'checkout';
    }
    // For any other event type, try to create a basic lead
    else if (payload.email) {
      leadData = this.createBasicLeadFromPayload(payload, eventType, integration, assignedTo);
      leadType = 'basic';
    }
    
    if (leadData) {
      const result = await this.createOrUpdateLead(leadData);
      logger.info(`Generic webhook processed as ${leadType} event:`, {
        eventType,
        leadId: result.data?._id,
        success: !!result.data,
        assignedTo: assignedTo
      });
      return { 
        success: true, 
        type: eventType,
        leadType: leadType,
        leadId: result.data?._id,
        assignedTo: assignedTo
      };
    } else {
      logger.info(`Generic webhook received but no lead created:`, {
        eventType,
        hasEmail: !!payload.email,
        payloadKeys: Object.keys(payload || {})
      });
      return { 
        success: true, 
        type: eventType,
        message: 'Webhook received and logged, but no lead created (no email found)',
        processed: true
      };
    }
  }

  // Create basic lead from any payload that has an email
  createBasicLeadFromPayload(payload, eventType, integration = null, assignedTo = null) {
    if (!payload.email) return null;

    const leadProperties = this.getLeadPropertiesByType('generic-event', payload);
    
    // Use integration settings if available, otherwise use defaults
    const organizationId = integration ? integration.organizationId : '507f1f77bcf86cd799439011';
    const leadSource = integration?.leadMappingConfig?.leadSource || 'shopify';
    const leadStatus = integration?.leadMappingConfig?.leadStatus || leadProperties.status;
    
    return {
      organizationId: organizationId,
      name: payload.name || 
            `${payload.first_name || ''} ${payload.last_name || ''}`.trim() ||
            payload.email.split('@')[0] ||
            'Unknown',
      email: payload.email,
      phone: payload.phone || payload.billing_address?.phone || payload.default_address?.phone,
      source: leadSource,
      sourceId: `shopify_${eventType}_${payload.id || Date.now()}`,
      status: leadStatus,
      priority: leadProperties.priority,
      score: leadProperties.leadScore,
      assignedTo: assignedTo,
      
      customFields: {
        shopifyEventType: eventType,
        shopifyId: payload.id,
        eventData: {
          type: eventType,
          receivedAt: new Date().toISOString(),
          originalPayload: payload
        },
        importedAt: new Date().toISOString(),
        importSource: 'shopify-webhook',
        webhookType: eventType
      },

      tags: [
        { name: `shopify-${eventType}`, color: '#9C27B0' },
        { name: 'shopify-generic', color: '#607D8B' },
        { name: 'auto-processed', color: '#4CAF50' }
      ],

      sourceDetails: {
        formId: `shopify_${eventType}_${payload.id}`,
        referenceId: String(payload.id || Date.now()),
        metadata: {
          eventType: eventType,
          autoProcessed: true,
          payloadKeys: Object.keys(payload || {})
        }
      }
    };
  }







  // Get lead properties based on webhook type
  getLeadPropertiesByType(leadType, data) {
    const properties = {
      'new-customer': { status: 'new', priority: 'medium', leadScore: 60, isQualified: false },
      'updated-customer': { status: 'new', priority: 'medium', leadScore: 65, isQualified: false },
      'hot-lead': { status: 'new', priority: 'high', leadScore: 80, isQualified: false },
      'confirmed-sale': { status: 'qualified', priority: 'high', leadScore: 95, isQualified: true },
      'updated-order': { status: 'new', priority: 'medium', leadScore: 75, isQualified: false },
      'abandoned-cart': { status: 'follow-up', priority: 'high', leadScore: 70, isQualified: false },
      'cart-recovery': { status: 'follow-up', priority: 'high', leadScore: 75, isQualified: false },
      'generic-order': { status: 'new', priority: 'medium', leadScore: 70, isQualified: false },
      'generic-customer': { status: 'new', priority: 'medium', leadScore: 50, isQualified: false },
      'generic-checkout': { status: 'follow-up', priority: 'medium', leadScore: 65, isQualified: false },
      'generic-event': { status: 'new', priority: 'low', leadScore: 40, isQualified: false }
    };

    // Enhanced scoring based on data
    let baseProperties = properties[leadType] || properties['generic-event'];
    
    // Boost score for high-value orders
    if (data.total_price && parseFloat(data.total_price) > 500) {
      baseProperties.leadScore = Math.min(baseProperties.leadScore + 15, 100);
      baseProperties.priority = 'high';
    }
    
    // Boost score for returning customers
    if (data.customer?.orders_count > 1 || data.orders_count > 1) {
      baseProperties.leadScore = Math.min(baseProperties.leadScore + 10, 100);
    }
    
    // Boost score for customers who accept marketing
    if (data.customer?.accepts_marketing || data.accepts_marketing) {
      baseProperties.leadScore = Math.min(baseProperties.leadScore + 5, 100);
    }

    return baseProperties;
  }

  // Get assigned user based on integration assignment settings
  getAssignedUser(integration) {
    if (!integration || !integration.assignmentSettings || !integration.assignmentSettings.enabled) {
      return null; // No assignment configured
    }

    const { mode, assignToUsers, algorithm } = integration.assignmentSettings;

    switch (mode) {
      case 'specific':
        // Use assignToUsers array - pick first user for now
        if (assignToUsers && assignToUsers.length > 0) {
          const user = assignToUsers[0];
          return user.userId ? user.userId.toString() : null;
        }
        return null;
      
      case 'round-robin':
        // Implement round-robin assignment
        return this.getRoundRobinUser(integration);
      
      case 'weighted-round-robin':
        // Implement weighted round-robin assignment
        return this.getWeightedRoundRobinUser(integration);
      
      case 'auto':
        // No specific assignment - let system decide
        return null;
      
      case 'manual':
        // Manual assignment - no auto assignment
        return null;
        
      default:
        // Default to first user from assignToUsers array
        if (assignToUsers && assignToUsers.length > 0) {
          const user = assignToUsers[0];
          return user.userId ? user.userId.toString() : null;
        }
        return null;
    }
  }

  // Round-robin assignment
  getRoundRobinUser(integration) {
    const { assignToUsers } = integration.assignmentSettings;
    if (!assignToUsers || assignToUsers.length === 0) return null;

    // Simple round-robin: cycle through users
    const currentIndex = (integration.assignmentSettings.lastAssignmentIndex || 0) % assignToUsers.length;
    const selectedUser = assignToUsers[currentIndex];
    
    // Update last assignment index for next time (don't await to avoid blocking)
    this.updateLastAssignmentIndex(integration._id, (currentIndex + 1) % assignToUsers.length);
    
    return selectedUser.userId ? selectedUser.userId.toString() : null;
  }

  // Weighted round-robin assignment
  getWeightedRoundRobinUser(integration) {
    const { assignToUsers } = integration.assignmentSettings;
    if (!assignToUsers || assignToUsers.length === 0) return null;

    // For weighted round-robin, we need to consider user weights
    // Simple implementation: repeat users based on their weight
    const weightedUsers = [];
    assignToUsers.forEach(user => {
      const weight = user.weight || 1;
      for (let i = 0; i < weight; i++) {
        weightedUsers.push(user);
      }
    });

    const currentIndex = (integration.assignmentSettings.lastAssignmentIndex || 0) % weightedUsers.length;
    const selectedUser = weightedUsers[currentIndex];
    
    // Update last assignment index for next time (don't await to avoid blocking)
    this.updateLastAssignmentIndex(integration._id, (currentIndex + 1) % weightedUsers.length);
    
    return selectedUser.userId ? selectedUser.userId.toString() : null;
  }

  // Update last assignment index in database (non-blocking)
  async updateLastAssignmentIndex(integrationId, newIndex) {
    try {
      await ShopifyIntegration.findByIdAndUpdate(integrationId, {
        'assignmentSettings.lastAssignmentIndex': newIndex
      });
    } catch (error) {
      logger.error('Error updating last assignment index:', error);
    }
  }

  // Update webhook statistics
  async updateWebhookStatistics(integration, eventType, success) {
    try {
      const updateData = {
        $inc: {
          'statistics.totalWebhooksReceived': 1
        },
        $set: {
          'statistics.lastWebhookReceived': new Date()
        }
      };

      if (success) {
        updateData.$inc['statistics.totalLeadsCreated'] = 1;
      }

      await ShopifyIntegration.findByIdAndUpdate(integration._id, updateData);
    } catch (error) {
      logger.error('Error updating webhook statistics:', error);
    }
  }

  // Auto-register new event types
  async autoRegisterEventType(integration, eventType) {
    try {
      const existingEvent = integration.webhookEvents.find(e => e.event === eventType);
      if (!existingEvent) {
        integration.webhookEvents.push({
          event: eventType,
          isEnabled: true
        });
        await integration.save();
        logger.info(`Auto-registered new webhook event: ${eventType} for organization: ${integration.organizationId}`);
      }
    } catch (error) {
      logger.error('Error auto-registering event type:', error);
    }
  }

  // Update createLeadFromOrder to include integration and assignment
  createLeadFromOrder(orderData, leadType, integration, assignedTo) {
    // Create minimal lead data to avoid validation issues
    const leadData = {
      organizationId: integration.organizationId.toString(), 
      name: `${orderData.customer?.first_name || 'Unknown'} ${orderData.customer?.last_name || ''}`.trim(),
      email: orderData.email || orderData.customer?.email,
      phone: orderData.customer?.phone || orderData.billing_address?.phone,
      source: 'shopify',
      status: 'new',
      priority: 'medium'
    };

    // Add assignedTo if available
    if (assignedTo) {
      leadData.assignedTo = assignedTo.toString();
    }

    // Add custom fields for Shopify data
    leadData.customFields = {
      shopifyOrderId: String(orderData.id),
      orderNumber: orderData.order_number,
      totalPrice: orderData.total_price,
      currency: orderData.currency,
      importedAt: new Date().toISOString(),
      importSource: 'shopify-webhook'
    };

    return leadData;
  }

  // Update createLeadFromCustomer to include integration and assignment
  createLeadFromCustomer(customerData, leadType, integration, assignedTo) {
    const leadProperties = this.getLeadPropertiesByType(leadType, customerData);

    return {
      organizationId: integration.organizationId.toString(),
      name: `${customerData.first_name || ''} ${customerData.last_name || ''}`.trim() || 'Unknown Customer',
      email: customerData.email,
      phone: customerData.phone || customerData.default_address?.phone,
      source: integration.leadMappingConfig?.leadSource || 'shopify',
      sourceId: `shopify_customer_${customerData.id}`,
      status: integration.leadMappingConfig?.leadStatus || leadProperties.status,
      priority: leadProperties.priority,
      score: leadProperties.leadScore,
      assignedTo: assignedTo ? assignedTo.toString() : null,

      customFields: {
        shopifyCustomerId: customerData.id,
        ordersCount: customerData.orders_count || 0,
        totalSpent: customerData.total_spent || '0.00',
        acceptsMarketing: customerData.accepts_marketing || false,
        tags: customerData.tags,
        createdAt: customerData.created_at,
        importedAt: new Date().toISOString(),
        importSource: 'shopify-webhook',
        webhookType: 'customer'
      },

      tags: [
        { name: 'shopify-customer', color: '#2196F3' },
        { name: `shopify-${leadType}`, color: '#FF9800' },
        { name: 'webhook-processed', color: '#4CAF50' }
      ],

      sourceDetails: {
        formId: `shopify_customer_${customerData.id}`,
        referenceId: String(customerData.id),
        metadata: {
          isNewCustomer: customerData.orders_count === 0,
          totalSpent: customerData.total_spent,
          acceptsMarketing: customerData.accepts_marketing,
          tags: customerData.tags
        }
      }
    };
  }

  // Update createLeadFromCheckout to include integration and assignment
  createLeadFromCheckout(checkoutData, leadType, integration, assignedTo) {
    const leadProperties = this.getLeadPropertiesByType(leadType, checkoutData);

    return {
      organizationId: integration.organizationId.toString(),
      name: `${checkoutData.customer?.first_name || checkoutData.billing_address?.first_name || 'Unknown'} ${checkoutData.customer?.last_name || checkoutData.billing_address?.last_name || ''}`.trim(),
      email: checkoutData.customer?.email || checkoutData.email,
      phone: checkoutData.customer?.phone || checkoutData.billing_address?.phone,
      source: integration.leadMappingConfig?.leadSource || 'shopify',
      sourceId: `shopify_checkout_${checkoutData.id}`,
      status: integration.leadMappingConfig?.leadStatus || leadProperties.status,
      priority: leadProperties.priority,
      score: leadProperties.leadScore,
      assignedTo: assignedTo ? assignedTo.toString() : null,

      customFields: {
        shopifyCheckoutId: checkoutData.id,
        shopifyCustomerId: checkoutData.customer?.id,
        cartToken: checkoutData.cart_token,
        abandonedCheckoutUrl: checkoutData.abandoned_checkout_url,
        totalPrice: checkoutData.total_price,
        currency: checkoutData.currency,
        createdAt: checkoutData.created_at,
        importedAt: new Date().toISOString(),
        importSource: 'shopify-webhook',
        webhookType: 'checkout'
      },

      tags: [
        { name: 'shopify-checkout', color: '#FF5722' },
        { name: `shopify-${leadType}`, color: '#795548' },
        { name: 'webhook-processed', color: '#4CAF50' }
      ],

      sourceDetails: {
        formId: `shopify_checkout_${checkoutData.id}`,
        referenceId: String(checkoutData.cart_token || checkoutData.id),
        metadata: {
          checkoutValue: checkoutData.total_price,
          currency: checkoutData.currency,
          lineItems: checkoutData.line_items?.length || 0,
          isAbandoned: !!checkoutData.abandoned_checkout_url
        }
      }
    };
  }
}

module.exports = new ShopifyService();
