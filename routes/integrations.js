const express = require('express');
const router = express.Router();

// Import all controllers
const facebookController = require('../controllers/facebook.controller');
const websiteController = require('../controllers/website.controller');
const shopifyController = require('../controllers/shopify.controller');

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'integrations-service',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.SERVICE_VERSION || '1.0.0'
  });
});

// Integration overview endpoint
router.get('/overview', async (req, res) => {
  try {
    const { organizationId } = req.user;
    
    // Get counts for each integration type
    const FacebookIntegration = require('../models/FacebookIntegration');
    const WebsiteIntegration = require('../models/WebsiteIntegration');
    const ShopifyIntegration = require('../models/ShopifyIntegration');

    const [facebookCount, websiteCount, shopifyCount] = await Promise.all([
      FacebookIntegration.countDocuments({ organizationId, isDeleted: false }),
      WebsiteIntegration.countDocuments({ organizationId, isDeleted: false }),
      ShopifyIntegration.countDocuments({ organizationId, isDeleted: false })
    ]);

    // Get recent activity
    const recentIntegrations = await Promise.all([
      FacebookIntegration.find({ organizationId, isDeleted: false })
        .sort({ createdAt: -1 }).limit(3).select('name createdAt isActive stats'),
      WebsiteIntegration.find({ organizationId, isDeleted: false })
        .sort({ createdAt: -1 }).limit(3).select('name domain createdAt isActive stats'),
      ShopifyIntegration.find({ organizationId, isDeleted: false })
        .sort({ createdAt: -1 }).limit(3).select('shopName shopDomain createdAt isActive stats')
    ]);

    const overview = {
      summary: {
        facebook: facebookCount,
        website: websiteCount,
        shopify: shopifyCount,
        total: facebookCount + websiteCount + shopifyCount
      },
      recent: {
        facebook: recentIntegrations[0].map(i => ({ ...i.toObject(), type: 'facebook' })),
        website: recentIntegrations[1].map(i => ({ ...i.toObject(), type: 'website' })),
        shopify: recentIntegrations[2].map(i => ({ ...i.toObject(), type: 'shopify' }))
      },
      supportedIntegrations: [
        {
          type: 'facebook',
          name: 'Facebook Lead Ads',
          description: 'Capture leads from Facebook ad campaigns',
          icon: 'facebook',
          features: ['Lead Forms', 'Page Management', 'Webhooks', 'Analytics']
        },
        {
          type: 'website',
          name: 'Website Forms',
          description: 'Embed lead capture forms on your website',
          icon: 'globe',
          features: ['Custom Forms', 'Embed Code', 'Domain Validation', 'Analytics']
        },
        {
          type: 'shopify',
          name: 'Shopify Store',
          description: 'Sync customers and orders from Shopify',
          icon: 'shopify',
          features: ['Customer Sync', 'Order Sync', 'Webhooks', 'Analytics']
        }
      ]
    };

    res.json({
      success: true,
      overview
    });

  } catch (error) {
    console.error('Error fetching integrations overview:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integrations overview'
    });
  }
});

// Mount integration-specific routes
router.use('/facebook', facebookController);
router.use('/website', websiteController);
router.use('/shopify', shopifyController);

// Webhook endpoints (public routes)
router.post('/webhooks/facebook', require('../controllers/facebook.controller'));
router.post('/webhooks/shopify/:topic', require('../controllers/shopify.controller'));

// Catch-all route for unsupported integrations
router.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Integration endpoint not found',
    availableEndpoints: [
      '/api/integrations/facebook',
      '/api/integrations/website', 
      '/api/integrations/shopify'
    ]
  });
});

module.exports = router;
