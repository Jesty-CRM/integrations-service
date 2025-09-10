const express = require('express');
const router = express.Router();
const shopifyService = require('../services/shopify.service');
const ShopifyIntegration = require('../models/ShopifyIntegration');
const { authenticateUser } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const logger = require('../utils/logger');

// Get Shopify integrations for organization
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    
    const integrations = await ShopifyIntegration.find({
      organizationId,
      isDeleted: false
    }).select('-accessToken').sort({ createdAt: -1 });

    res.json({
      success: true,
      integrations
    });
  } catch (error) {
    logger.error('Error fetching Shopify integrations:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integrations'
    });
  }
});

// Get specific Shopify integration
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await ShopifyIntegration.findOne({
      _id: id,
      organizationId,
      isDeleted: false
    }).select('-accessToken');

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    res.json({
      success: true,
      integration
    });
  } catch (error) {
    logger.error('Error fetching Shopify integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integration'
    });
  }
});

// Initiate Shopify OAuth
router.post('/connect', authenticateUser, validateRequest(['shop']), async (req, res) => {
  try {
    const { userId, organizationId } = req.user;
    const { shop } = req.body;
    
    // Validate shop domain format
    const shopDomain = shop.replace(/^https?:\/\//, '').replace(/\.myshopify\.com$/, '');
    
    const state = Buffer.from(JSON.stringify({
      userId,
      organizationId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = shopifyService.generateOAuthURL(shopDomain, state);

    res.json({
      success: true,
      authUrl,
      state,
      shopDomain
    });
  } catch (error) {
    logger.error('Error generating Shopify OAuth URL:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate authorization URL'
    });
  }
});

// Handle Shopify OAuth callback
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state, shop, error } = req.query;

    if (error) {
      logger.error('Shopify OAuth error:', error);
      return res.redirect(`${process.env.FRONTEND_URL}/integrations/shopify?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state || !shop) {
      return res.redirect(`${process.env.FRONTEND_URL}/integrations/shopify?error=missing_parameters`);
    }

    // Exchange code for access token and create integration
    const integration = await shopifyService.handleOAuthCallback(shop, code, state);

    res.redirect(`${process.env.FRONTEND_URL}/integrations/shopify?success=true&id=${integration._id}`);
  } catch (error) {
    logger.error('Error handling Shopify OAuth callback:', error.message);
    res.redirect(`${process.env.FRONTEND_URL}/integrations/shopify?error=${encodeURIComponent(error.message)}`);
  }
});

// Update integration settings
router.put('/:id', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const integration = await ShopifyIntegration.findOneAndUpdate(
      { _id: id, organizationId },
      {
        ...updates,
        updatedAt: new Date()
      },
      { new: true }
    ).select('-accessToken');

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    res.json({
      success: true,
      integration
    });
  } catch (error) {
    logger.error('Error updating Shopify integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update integration'
    });
  }
});

// Sync Shopify customers
router.post('/:id/sync-customers', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { since, limit } = req.body;

    const integration = await ShopifyIntegration.findOne({
      _id: id,
      organizationId,
      isActive: true,
      isInstalled: true
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found or not active'
      });
    }

    const result = await shopifyService.syncCustomers(integration, { since, limit });

    res.json({
      success: true,
      ...result,
      message: 'Customers sync completed'
    });
  } catch (error) {
    logger.error('Error syncing Shopify customers:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to sync customers'
    });
  }
});

// Sync Shopify orders
router.post('/:id/sync-orders', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { since, limit } = req.body;

    const integration = await ShopifyIntegration.findOne({
      _id: id,
      organizationId,
      isActive: true,
      isInstalled: true
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found or not active'
      });
    }

    const result = await shopifyService.syncOrders(integration, { since, limit });

    res.json({
      success: true,
      ...result,
      message: 'Orders sync completed'
    });
  } catch (error) {
    logger.error('Error syncing Shopify orders:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to sync orders'
    });
  }
});

// Full sync (customers + orders)
router.post('/:id/sync-all', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { since } = req.body;

    const integration = await ShopifyIntegration.findOne({
      _id: id,
      organizationId,
      isActive: true,
      isInstalled: true
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found or not active'
      });
    }

    // Run both syncs
    const customerResult = await shopifyService.syncCustomers(integration, { since });
    const orderResult = await shopifyService.syncOrders(integration, { since });

    res.json({
      success: true,
      customers: customerResult,
      orders: orderResult,
      message: 'Full sync completed'
    });
  } catch (error) {
    logger.error('Error syncing all Shopify data:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to sync data'
    });
  }
});

// Get shop information
router.get('/:id/shop-info', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await ShopifyIntegration.findOne({
      _id: id,
      organizationId,
      isActive: true
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const shopInfo = {
      shopDomain: integration.shopDomain,
      shopName: integration.shopName,
      shopOwner: integration.shopOwner,
      shopEmail: integration.shopEmail,
      isInstalled: integration.isInstalled,
      isActive: integration.isActive,
      createdAt: integration.createdAt,
      lastSync: integration.lastSync,
      stats: integration.stats
    };

    res.json({
      success: true,
      shopInfo
    });
  } catch (error) {
    logger.error('Error fetching shop info:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shop information'
    });
  }
});

// Test integration connection
router.post('/:id/test', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await ShopifyIntegration.findOne({
      _id: id,
      organizationId,
      isActive: true
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    // Test connection by making a simple API call
    try {
      const axios = require('axios');
      const response = await axios.get(
        `https://${integration.shopDomain}.myshopify.com/admin/api/${shopifyService.apiVersion}/shop.json`,
        {
          headers: {
            'X-Shopify-Access-Token': integration.accessToken
          }
        }
      );

      res.json({
        success: true,
        isConnected: true,
        shopInfo: response.data.shop,
        message: 'Connection is working'
      });
    } catch (apiError) {
      res.json({
        success: false,
        isConnected: false,
        message: 'Connection failed',
        error: apiError.response?.data?.errors || apiError.message
      });
    }
  } catch (error) {
    logger.error('Error testing Shopify integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to test integration'
    });
  }
});

// Get integration statistics
router.get('/:id/stats', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { period = '30d' } = req.query;

    const integration = await ShopifyIntegration.findOne({
      _id: id,
      organizationId
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    // Calculate period dates
    let startDate;
    switch (period) {
      case '7d':
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    }

    const stats = {
      summary: integration.stats,
      period: period,
      startDate: startDate,
      endDate: new Date(),
      lastSync: integration.lastSync,
      webhooks: integration.webhooks?.length || 0
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Error fetching Shopify integration stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// Delete integration
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await ShopifyIntegration.findOneAndUpdate(
      { _id: id, organizationId },
      { 
        isDeleted: true,
        isActive: false,
        isInstalled: false,
        deletedAt: new Date()
      },
      { new: true }
    );

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    res.json({
      success: true,
      message: 'Integration deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting Shopify integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete integration'
    });
  }
});

// Webhook endpoint for Shopify
router.post('/webhook/:topic', async (req, res) => {
  try {
    const { topic } = req.params;
    const shop = req.get('X-Shopify-Shop-Domain');
    const signature = req.get('X-Shopify-Hmac-Sha256');
    const rawBody = JSON.stringify(req.body);

    // Verify webhook authenticity
    const isValid = shopifyService.verifyWebhook(rawBody, signature, process.env.SHOPIFY_WEBHOOK_SECRET);
    
    if (!isValid) {
      logger.warn('Invalid Shopify webhook signature');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Process webhook
    await shopifyService.handleWebhook(topic.replace('-', '/'), req.body, shop);

    res.status(200).json({ success: true });
  } catch (error) {
    logger.error('Error processing Shopify webhook:', error.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
