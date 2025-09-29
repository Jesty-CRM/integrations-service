const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopifyService');
const logger = require('../utils/logger');

/**
 * @route GET /api/shopify/webhook/:organizationId
 * @desc Get webhook URL for an organization
 * @access Public
 */
router.get('/webhook/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const baseUrl = process.env.INTEGRATIONS_SERVICE_URL || `${req.protocol}://${req.get('host')}`;
    
    const webhookUrl = `${baseUrl}/api/webhooks/shopify/${organizationId}`;
    
    const webhookInfo = {
      organizationId,
      webhookUrl,
      status: 'ready',
      supportedEvents: [
        'orders/create',
        'orders/paid', 
        'customers/create',
        'checkouts/create'
      ],
      instructions: {
        steps: [
          'Go to your Shopify Admin → Settings → Notifications',
          'Scroll down to the "Webhooks" section',
          'Click "Create webhook"',
          'Select the event type you want to track',
          'Paste the webhook URL provided above',
          'Set Format to "JSON"',
          'Save the webhook'
        ],
        testUrl: `${baseUrl}/api/shopify/test-webhook/${organizationId}`
      },
      createdAt: new Date().toISOString()
    };

    logger.info(`Webhook URL generated for organization: ${organizationId}`);
    
    res.json({
      success: true,
      data: webhookInfo
    });

  } catch (error) {
    logger.error('Error generating webhook URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate webhook URL',
      details: error.message
    });
  }
});

/**
 * @route GET /api/shopify/webhooks
 * @desc Get webhook configuration with detailed event info
 * @access Public
 */
router.get('/webhooks', async (req, res) => {
  try {
    const baseUrl = process.env.INTEGRATIONS_SERVICE_URL || `${req.protocol}://${req.get('host')}`;
    const defaultOrgId = process.env.DEFAULT_ORGANIZATION_ID || '507f1f77bcf86cd799439011';
    
    const webhookConfig = {
      organizationId: defaultOrgId,
      webhookUrl: `${baseUrl}/api/webhooks/shopify/${defaultOrgId}`,
      genericWebhookUrl: `${baseUrl}/api/webhooks/shopify`,
      status: 'ready',
      supportedEvents: [
        {
          event: 'orders/create',
          description: 'New order created - Creates new lead from order details',
          priority: 'medium',
          leadScore: 60,
          webhookUrl: `${baseUrl}/api/webhooks/shopify`,
          samplePayload: 'Use order creation JSON from documentation'
        },
        {
          event: 'orders/paid', 
          description: 'Order payment completed - Creates high priority lead',
          priority: 'high',
          leadScore: 90,
          webhookUrl: `${baseUrl}/api/webhooks/shopify`,
          samplePayload: 'Use paid order JSON from documentation'
        },
        {
          event: 'customers/create',
          description: 'New customer registered - Creates lead for follow-up',
          priority: 'medium', 
          leadScore: 50,
          webhookUrl: `${baseUrl}/api/webhooks/shopify`,
          samplePayload: 'Use customer creation JSON from documentation'
        },
        {
          event: 'checkouts/create',
          description: 'Abandoned cart created - Creates lead for recovery',
          priority: 'high',
          leadScore: 80,
          webhookUrl: `${baseUrl}/api/webhooks/shopify`,
          samplePayload: 'Use abandoned checkout JSON from documentation'
        }
      ],
      setupInstructions: [
        'Copy your webhook URL from above',
        'Go to Shopify Admin → Settings → Notifications', 
        'Scroll to "Webhooks" section and click "Create webhook"',
        'Select the event type (orders/create, orders/paid, etc.)',
        'Paste your webhook URL',
        'Set Format to "JSON" and API version to "Latest"',
        'Save the webhook',
        'Repeat for each event type you want to track'
      ],
      testEndpoint: `${baseUrl}/api/shopify/test-webhook/${defaultOrgId}`,
      createdAt: new Date().toISOString()
    };

    logger.info('Webhook configuration retrieved');
    
    res.json({
      success: true,
      message: 'Shopify webhook configuration retrieved successfully',
      data: webhookConfig
    });

  } catch (error) {
    logger.error('Error retrieving webhook configuration:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve webhook configuration',
      details: error.message
    });
  }
});

/**
 * @route POST /api/shopify/test-webhook/:organizationId
 * @desc Test webhook endpoint with sample data
 * @access Public (for testing)
 */
router.post('/test-webhook/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { eventType = 'orders/create' } = req.body;

    // Sample test data based on event type
    const testData = {
      'orders/create': {
        id: 99999999999,
        order_number: 9999,
        name: '#TEST-9999',
        email: 'test@example.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        total_price: '99.99',
        subtotal_price: '89.99',
        total_tax: '10.00',
        currency: 'USD',
        financial_status: 'pending',
        fulfillment_status: 'pending',
        note: 'Test webhook order',
        tags: 'test,webhook',
        customer: {
          id: 88888888888,
          first_name: 'Test',
          last_name: 'Customer',
          email: 'test@example.com',
          phone: '+1-555-TEST-123',
          accepts_marketing: true,
          orders_count: 1,
          total_spent: '99.99',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        billing_address: {
          first_name: 'Test',
          last_name: 'Customer',
          address1: '123 Test Street',
          city: 'Test City',
          province: 'TS',
          country: 'United States',
          zip: '12345',
          phone: '+1-555-TEST-123',
          company: 'Test Company'
        },
        line_items: [{
          id: 777777777,
          name: 'Test Product',
          title: 'Test Product',
          quantity: 1,
          price: '89.99',
          sku: 'TEST-PROD-001',
          vendor: 'TestCorp'
        }]
      },
      'customers/create': {
        id: 88888888888,
        first_name: 'Test',
        last_name: 'Customer',
        email: 'test@example.com',
        phone: '+1-555-TEST-123',
        accepts_marketing: true,
        orders_count: 0,
        total_spent: '0.00',
        tags: 'test-customer',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        default_address: {
          first_name: 'Test',
          last_name: 'Customer',
          address1: '123 Test Street',
          city: 'Test City',
          province: 'TS',
          country: 'United States',
          zip: '12345',
          phone: '+1-555-TEST-123'
        }
      },
      'orders/paid': {
        id: 99999999998,
        order_number: 9998,
        name: '#TEST-9998',
        email: 'paid@example.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        total_price: '199.99',
        subtotal_price: '179.99',
        total_tax: '20.00',
        currency: 'USD',
        financial_status: 'paid',
        fulfillment_status: 'pending',
        note: 'Test paid order',
        tags: 'test,paid,high-value',
        customer: {
          id: 88888888887,
          first_name: 'Paid',
          last_name: 'Customer',
          email: 'paid@example.com',
          phone: '+1-555-PAID-123',
          accepts_marketing: true,
          orders_count: 2,
          total_spent: '399.98',
          created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString()
        },
        billing_address: {
          first_name: 'Paid',
          last_name: 'Customer',
          address1: '456 Premium Street',
          city: 'Premium City',
          province: 'PM',
          country: 'United States',
          zip: '54321',
          phone: '+1-555-PAID-123',
          company: 'Premium Corp'
        },
        line_items: [{
          id: 777777778,
          name: 'Premium Product',
          title: 'Premium Product',
          quantity: 1,
          price: '179.99',
          sku: 'PREM-PROD-001',
          vendor: 'PremiumCorp'
        }]
      },
      'checkouts/create': {
        id: 66666666666,
        cart_token: 'test_cart_token_123',
        email: 'abandoned@example.com',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        completed_at: null,
        total_price: '149.99',
        subtotal_price: '129.99',
        total_tax: '20.00',
        currency: 'USD',
        abandoned_checkout_url: 'https://test.example.com/recover/test123',
        billing_address: {
          first_name: 'Abandoned',
          last_name: 'Cart',
          address1: '789 Cart Street',
          city: 'Cart City',
          province: 'CA',
          country: 'United States',
          zip: '67890',
          phone: '+1-555-CART-123'
        },
        line_items: [{
          id: 777777779,
          name: 'Abandoned Product',
          title: 'Abandoned Product',
          quantity: 1,
          price: '129.99',
          sku: 'ABANDON-001',
          vendor: 'CartCorp'
        }]
      }
    };

    const payload = testData[eventType] || testData['orders/create'];
    const headers = {
      'x-shopify-topic': eventType,
      'content-type': 'application/json'
    };

    // Process the test webhook
    const result = await shopifyService.handleWebhook(payload, headers);

    logger.info(`Test webhook processed for organization: ${organizationId}`, {
      eventType,
      success: result.success,
      leadId: result.leadId
    });

    res.json({
      success: true,
      message: `Test webhook processed successfully for event: ${eventType}`,
      data: {
        organizationId,
        eventType,
        testPayload: payload,
        processResult: result,
        leadCreated: result.success,
        leadId: result.leadId || result.data?._id,
        leadScore: payload.customer?.total_spent ? 
          (parseFloat(payload.customer.total_spent) > 100 ? 'high' : 'medium') : 'medium',
        priority: eventType === 'orders/paid' || eventType === 'checkouts/create' ? 'high' : 'medium'
      }
    });

  } catch (error) {
    logger.error('Error processing test webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process test webhook',
      details: error.message,
      eventType: req.body.eventType
    });
  }
});

/**
 * @route POST /api/shopify/test-webhook
 * @desc Test webhook endpoint without organization ID
 * @access Public (for testing)
 */
router.post('/test-webhook', async (req, res) => {
  try {
    const { eventType = 'orders/create', organizationId } = req.body;
    const testOrgId = organizationId || process.env.DEFAULT_ORGANIZATION_ID || '507f1f77bcf86cd799439011';

    // Forward to the main test endpoint
    req.params.organizationId = testOrgId;
    return router.handle(req, res);

  } catch (error) {
    logger.error('Error processing generic test webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process test webhook',
      details: error.message
    });
  }
});

/**
 * @route GET /api/shopify/webhook-stats/:organizationId
 * @desc Get webhook statistics for an organization
 * @access Public
 */
router.get('/webhook-stats/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;

    // This would typically come from a database
    // For now, returning mock statistics
    const stats = {
      organizationId,
      totalWebhooksReceived: 0,
      totalLeadsCreated: 0,
      webhooksByType: {
        'orders/create': 0,
        'orders/paid': 0,
        'customers/create': 0,
        'checkouts/create': 0
      },
      leadsByPriority: {
        high: 0,
        medium: 0,
        low: 0
      },
      averageLeadScore: 0,
      highPriorityLeads: 0,
      conversionRate: '0%',
      totalRevenue: 0,
      lastWebhookReceived: null,
      lastLeadCreated: null,
      period: 'last_30_days',
      status: 'active',
      webhookEndpoints: {
        generic: `${process.env.INTEGRATIONS_SERVICE_URL || 'http://localhost:3005'}/api/webhooks/shopify`,
        organization: `${process.env.INTEGRATIONS_SERVICE_URL || 'http://localhost:3005'}/api/webhooks/shopify/${organizationId}`
      }
    };

    logger.info(`Webhook statistics retrieved for organization: ${organizationId}`);

    res.json({
      success: true,
      message: 'Webhook statistics retrieved successfully',
      data: stats
    });

  } catch (error) {
    logger.error('Error retrieving webhook statistics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve webhook statistics',
      details: error.message
    });
  }
});

/**
 * @route GET /api/shopify/events
 * @desc Get all supported Shopify webhook events with details
 * @access Public
 */
router.get('/events', async (req, res) => {
  try {
    const baseUrl = process.env.INTEGRATIONS_SERVICE_URL || `${req.protocol}://${req.get('host')}`;

    const events = [
      {
        event: 'orders/create',
        name: 'Order Created',
        description: 'Triggered when a new order is placed in Shopify',
        priority: 'medium',
        leadScore: 60,
        leadStatus: 'new',
        webhookUrl: `${baseUrl}/api/webhooks/shopify`,
        testEndpoint: `${baseUrl}/api/shopify/test-webhook`,
        fields: [
          'order_id', 'customer_email', 'total_price', 'line_items', 
          'billing_address', 'shipping_address', 'customer_info'
        ],
        leadCreation: {
          enabled: true,
          leadType: 'order',
          customFields: ['shopifyOrderId', 'orderValue', 'orderItems', 'financialStatus'],
          tags: ['shopify-order', 'new-order']
        }
      },
      {
        event: 'orders/paid',
        name: 'Order Paid',
        description: 'Triggered when payment is completed for an order',
        priority: 'high',
        leadScore: 90,
        leadStatus: 'qualified',
        webhookUrl: `${baseUrl}/api/webhooks/shopify`,
        testEndpoint: `${baseUrl}/api/shopify/test-webhook`,
        fields: [
          'order_id', 'customer_email', 'total_price', 'financial_status',
          'payment_details', 'customer_info'
        ],
        leadCreation: {
          enabled: true,
          leadType: 'paid-order',
          customFields: ['shopifyOrderId', 'orderValue', 'paymentStatus', 'customerValue'],
          tags: ['shopify-order', 'paid-order', 'high-priority']
        }
      },
      {
        event: 'customers/create',
        name: 'Customer Created',
        description: 'Triggered when a new customer registers',
        priority: 'medium',
        leadScore: 50,
        leadStatus: 'new',
        webhookUrl: `${baseUrl}/api/webhooks/shopify`,
        testEndpoint: `${baseUrl}/api/shopify/test-webhook`,
        fields: [
          'customer_id', 'email', 'first_name', 'last_name', 
          'phone', 'default_address', 'accepts_marketing'
        ],
        leadCreation: {
          enabled: true,
          leadType: 'customer',
          customFields: ['shopifyCustomerId', 'acceptsMarketing', 'customerTags'],
          tags: ['shopify-customer', 'new-customer']
        }
      },
      {
        event: 'checkouts/create',
        name: 'Abandoned Cart',
        description: 'Triggered when a checkout is abandoned',
        priority: 'high',
        leadScore: 80,
        leadStatus: 'follow-up',
        webhookUrl: `${baseUrl}/api/webhooks/shopify`,
        testEndpoint: `${baseUrl}/api/shopify/test-webhook`,
        fields: [
          'checkout_id', 'cart_token', 'email', 'total_price',
          'line_items', 'abandoned_checkout_url'
        ],
        leadCreation: {
          enabled: true,
          leadType: 'abandoned-cart',
          customFields: ['checkoutUrl', 'cartValue', 'abandonedItems'],
          tags: ['shopify-checkout', 'abandoned-cart', 'recovery-opportunity']
        }
      }
    ];

    res.json({
      success: true,
      message: 'Shopify webhook events retrieved successfully',
      data: {
        totalEvents: events.length,
        events,
        setup: {
          baseWebhookUrl: `${baseUrl}/api/webhooks/shopify`,
          organizationWebhookUrl: `${baseUrl}/api/webhooks/shopify/{organizationId}`,
          testEndpoint: `${baseUrl}/api/shopify/test-webhook`,
          documentation: 'Use the provided JSON payloads for each event type'
        }
      }
    });

  } catch (error) {
    logger.error('Error retrieving webhook events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve webhook events',
      details: error.message
    });
  }
});

module.exports = router;