const shopifyService = require('../services/shopifyService');
const { formatResponse, formatError } = require('../utils/responseFormatter');
const logger = require('../utils/logger');

const shopifyController = {
  // Create or update Shopify integration
  async createIntegration(req, res) {
    try {
      const { organizationId, id: userId } = req.user;
      const config = req.body;

      const result = await shopifyService.createIntegration(organizationId, userId, config);
      
      res.status(200).json(formatResponse(result, 'Shopify integration created successfully'));
    } catch (error) {
      logger.error('Error creating Shopify integration:', error);
      res.status(500).json(formatError('Failed to create Shopify integration', error.message));
    }
  },

  // Get integration details
  async getIntegration(req, res) {
    try {
      const { organizationId } = req.user;
      
      const integration = await shopifyService.getIntegration(organizationId);
      
      if (!integration) {
        return res.status(404).json(formatError('Shopify integration not found'));
      }

      // Don't expose sensitive data
      const sanitizedIntegration = {
        ...integration.toObject(),
        webhookSecret: undefined
      };

      res.status(200).json(formatResponse(sanitizedIntegration, 'Integration retrieved successfully'));
    } catch (error) {
      logger.error('Error getting Shopify integration:', error);
      res.status(500).json(formatError('Failed to get Shopify integration', error.message));
    }
  },

  // Update integration settings
  async updateIntegration(req, res) {
    try {
      const { organizationId } = req.user;
      const updates = req.body;

      // Don't allow updating sensitive fields
      delete updates.webhookSecret;
      delete updates.webhookEndpoint;
      delete updates.organizationId;

      const result = await shopifyService.updateIntegration(organizationId, updates);
      
      res.status(200).json(formatResponse(result.integration, 'Integration updated successfully'));
    } catch (error) {
      logger.error('Error updating Shopify integration:', error);
      res.status(500).json(formatError('Failed to update Shopify integration', error.message));
    }
  },

  // Delete integration
  async deleteIntegration(req, res) {
    try {
      const { organizationId } = req.user;
      
      const result = await shopifyService.deleteIntegration(organizationId);
      
      res.status(200).json(formatResponse(result, 'Integration deleted successfully'));
    } catch (error) {
      logger.error('Error deleting Shopify integration:', error);
      res.status(500).json(formatError('Failed to delete Shopify integration', error.message));
    }
  },

  // Handle incoming webhooks
  async handleWebhook(req, res) {
    try {
      const organizationId = req.params.organizationId;
      const signature = req.get('X-Shopify-Hmac-Sha256');
      const topic = req.get('X-Shopify-Topic');
      const rawBody = req.body;

      // Log webhook receipt
      logger.info('Shopify webhook received:', {
        organizationId,
        topic,
        hasSignature: !!signature
      });

      // Verify signature
      if (!shopifyService.verifyWebhookSignature(rawBody, signature, organizationId)) {
        logger.warn('Invalid webhook signature for organization:', organizationId);
        return res.status(401).json(formatError('Invalid webhook signature'));
      }

      // Parse payload
      let payload;
      try {
        payload = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
      } catch (parseError) {
        logger.error('Error parsing webhook payload:', parseError);
        return res.status(400).json(formatError('Invalid JSON payload'));
      }

      // Process webhook
      const result = await shopifyService.processWebhook(organizationId, topic, payload, req.headers);
      
      logger.info('Webhook processed successfully:', {
        organizationId,
        topic,
        success: result.success
      });

      res.status(200).json(formatResponse(result, 'Webhook processed successfully'));
    } catch (error) {
      logger.error('Error handling Shopify webhook:', error);
      res.status(500).json(formatError('Failed to process webhook', error.message));
    }
  },

  // Get webhook setup instructions
  async getSetupInstructions(req, res) {
    try {
      const { organizationId } = req.user;
      
      const integration = await shopifyService.getIntegration(organizationId);
      
      if (!integration) {
        return res.status(404).json(formatError('Integration not found. Please create integration first.'));
      }

      const instructions = shopifyService.getSetupInstructions(integration.webhookEndpoint);
      
      res.status(200).json(formatResponse(instructions, 'Setup instructions retrieved successfully'));
    } catch (error) {
      logger.error('Error getting setup instructions:', error);
      res.status(500).json(formatError('Failed to get setup instructions', error.message));
    }
  },

  // Test webhook endpoint
  async testWebhook(req, res) {
    try {
      const { organizationId } = req.user;
      const testPayload = req.body.payload || {
        id: 'test_order_123',
        order_number: 1001,
        email: 'test@example.com',
        customer: {
          id: 'test_customer_456',
          first_name: 'Test',
          last_name: 'Customer',
          email: 'test@example.com'
        },
        total_price: '29.99',
        currency: 'USD',
        created_at: new Date().toISOString()
      };

      const result = await shopifyService.processWebhook(
        organizationId, 
        'orders/create', 
        testPayload,
        {}
      );
      
      res.status(200).json(formatResponse(result, 'Test webhook processed successfully'));
    } catch (error) {
      logger.error('Error testing webhook:', error);
      res.status(500).json(formatError('Failed to test webhook', error.message));
    }
  },

  // Get integration statistics
  async getStatistics(req, res) {
    try {
      const { organizationId } = req.user;
      
      const integration = await shopifyService.getIntegration(organizationId);
      
      if (!integration) {
        return res.status(404).json(formatError('Integration not found'));
      }

      const stats = {
        isActive: integration.isActive,
        webhookEndpoint: integration.webhookEndpoint,
        statistics: integration.statistics,
        leadMappingConfig: integration.leadMappingConfig,
        webhookEvents: integration.webhookEvents,
        lastError: integration.lastError?.resolved === false ? integration.lastError : null,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt
      };
      
      res.status(200).json(formatResponse(stats, 'Statistics retrieved successfully'));
    } catch (error) {
      logger.error('Error getting statistics:', error);
      res.status(500).json(formatError('Failed to get statistics', error.message));
    }
  }
};

module.exports = shopifyController;