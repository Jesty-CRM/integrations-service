const express = require('express');
const router = express.Router();

// Import all controllers
const facebookController = require('../controllers/facebook.controller');
const websiteController = require('../controllers/website.controller');
const shopifyController = require('../controllers/shopify.controller');
const aiAgentController = require('../controllers/aiAgent.controller');

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
    const AIAgentIntegration = require('../models/AIAgentIntegration');

    const [facebookCount, websiteCount, shopifyCount, aiAgentCount] = await Promise.all([
      FacebookIntegration.countDocuments({ organizationId, isDeleted: false }),
      WebsiteIntegration.countDocuments({ organizationId, isDeleted: false }),
      ShopifyIntegration.countDocuments({ organizationId, isDeleted: false }),
      AIAgentIntegration.countDocuments({ organizationId, isDeleted: false })
    ]);

    // Get recent activity
    const recentIntegrations = await Promise.all([
      FacebookIntegration.find({ organizationId, isDeleted: false })
        .sort({ createdAt: -1 }).limit(3).select('name createdAt isActive stats'),
      WebsiteIntegration.find({ organizationId, isDeleted: false })
        .sort({ createdAt: -1 }).limit(3).select('name domain createdAt isActive stats'),
      ShopifyIntegration.find({ organizationId, isDeleted: false })
        .sort({ createdAt: -1 }).limit(3).select('shopName shopDomain createdAt isActive stats'),
      AIAgentIntegration.find({ organizationId, isDeleted: false })
        .sort({ createdAt: -1 }).limit(3).select('name platforms createdAt isActive stats')
    ]);

    const overview = {
      summary: {
        facebook: facebookCount,
        website: websiteCount,
        shopify: shopifyCount,
        aiAgent: aiAgentCount,
        total: facebookCount + websiteCount + shopifyCount + aiAgentCount
      },
      recent: {
        facebook: recentIntegrations[0].map(i => ({ ...i.toObject(), type: 'facebook' })),
        website: recentIntegrations[1].map(i => ({ ...i.toObject(), type: 'website' })),
        shopify: recentIntegrations[2].map(i => ({ ...i.toObject(), type: 'shopify' })),
        aiAgent: recentIntegrations[3].map(i => ({ ...i.toObject(), type: 'ai-agent' }))
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
        },
        {
          type: 'ai-agent',
          name: 'AI Chat Agent',
          description: 'Intelligent chatbot for multiple platforms',
          icon: 'bot',
          features: ['Multi-platform', 'Lead Qualification', 'Auto-responses', 'Analytics']
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
router.use('/ai-agents', aiAgentController);

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
      '/api/integrations/shopify',
      '/api/integrations/ai-agents'
    ]
  });
});

module.exports = router;
