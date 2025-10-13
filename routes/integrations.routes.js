const express = require('express');
const router = express.Router();
const integrationsController = require('../controllers/integrations.controller');
const authMiddleware = require('../middleware/auth');
const validation = require('../middleware/validation');

// All routes require authentication
router.use(authMiddleware.authenticateUser);

/**
 * @route   GET /api/integrations
 * @desc    Get all integrations for company
 * @access  Private
 */
router.get('/', integrationsController.getIntegrations);

/**
 * @route   GET /api/integrations/status
 * @desc    Get connection status of all integrations for organization
 * @access  Private
 */
router.get('/status', async (req, res) => {
  try {
    const { organizationId } = req.user;
    
    // Get integration models
    const FacebookIntegration = require('../models/FacebookIntegration');
    const WebsiteIntegration = require('../models/WebsiteIntegration');
    const ShopifyIntegration = require('../models/ShopifyIntegration');

    // Check Facebook integration status
    const facebookIntegration = await FacebookIntegration.findOne({ 
      organizationId, 
      $or: [
        { isDeleted: false },
        { isDeleted: { $exists: false } }
      ]
    }).select('connected lastSync stats fbUserName tokenExpiresAt needsUserMigration');

    // Check Website integration status
    const websiteIntegrations = await WebsiteIntegration.find({ 
      organizationId,
      $or: [
        { isDeleted: false },
        { isDeleted: { $exists: false } }
      ]
    }).select('name domain isActive stats createdAt');

    // Check Shopify integration status
    const shopifyIntegration = await ShopifyIntegration.findOne({ 
      organizationId,
      $or: [
        { isDeleted: false },
        { isDeleted: { $exists: false } }
      ]
    }).select('isActive shopName shopDomain stats lastSync createdAt');

    // Determine status for each integration type
    const integrationStatus = {
      facebook: {
        platform: 'Facebook',
        status: facebookIntegration ? 
          (facebookIntegration.connected ? 'connected' : 'not_configured') : 'not_configured',
        lastActivity: facebookIntegration?.lastSync || null,
        isActive: facebookIntegration?.connected || false,
        configuredAt: facebookIntegration?.createdAt || null,
        totalLeads: facebookIntegration?.stats?.totalLeads || 0,
        lastLeadReceived: facebookIntegration?.stats?.lastLeadReceived || undefined,
        userName: facebookIntegration?.fbUserName || null,
        tokenExpiry: facebookIntegration?.tokenExpiresAt || null,
        needsMigration: facebookIntegration?.needsUserMigration || false
      },
      
      shopify: {
        platform: 'Shopify',
        status: shopifyIntegration ? 
          (shopifyIntegration.isActive ? 'connected' : 'not_configured') : 'not_configured',
        lastActivity: shopifyIntegration?.lastSync || null,
        isActive: shopifyIntegration?.isActive || false,
        configuredAt: shopifyIntegration?.createdAt || null,
        totalLeads: shopifyIntegration?.stats?.totalLeads || 0,
        shopName: shopifyIntegration?.shopName || null,
        shopDomain: shopifyIntegration?.shopDomain || null
      },
      
      website: {
        platform: 'Website',
        status: websiteIntegrations.length > 0 ? 
          (websiteIntegrations.some(w => w.isActive) ? 'connected' : 'configured_inactive') : 'not_configured',
        lastActivity: websiteIntegrations.length > 0 ? 
          websiteIntegrations.reduce((latest, w) => {
            const lastLead = w.stats?.lastLeadReceived;
            return lastLead && (!latest || lastLead > latest) ? lastLead : latest;
          }, null) : null,
        isActive: websiteIntegrations.some(w => w.isActive) || false,
        totalIntegrations: websiteIntegrations.length,
        activeIntegrations: websiteIntegrations.filter(w => w.isActive).length,
        totalLeads: websiteIntegrations.reduce((total, w) => total + (w.stats?.totalLeads || 0), 0),
        integrations: websiteIntegrations.map(w => ({
          id: w._id,
          name: w.name,
          domain: w.domain,
          isActive: w.isActive,
          totalLeads: w.stats?.totalLeads || 0
        }))
      },
      
      wordpress: {
        platform: 'WordPress',
        status: 'not_configured', // WordPress integration not implemented yet
        lastActivity: null,
        isActive: false
      }
    };

    // Calculate overall status
    const connectedIntegrations = Object.values(integrationStatus).filter(
      integration => integration.status === 'connected'
    ).length;
    
    const totalIntegrations = Object.keys(integrationStatus).length;
    
    const overallStatus = {
      hasAnyIntegration: connectedIntegrations > 0,
      connectedCount: connectedIntegrations,
      totalAvailable: totalIntegrations,
      connectionRate: Math.round((connectedIntegrations / totalIntegrations) * 100)
    };

    res.json({
      success: true,
      data: {
        organizationId,
        overall: overallStatus,
        integrations: integrationStatus,
        lastUpdated: new Date().toISOString()
      },
      message: `${connectedIntegrations} of ${totalIntegrations} integrations connected`
    });

  } catch (error) {
    console.error('Error fetching integration status:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integration status',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/integrations/:provider
 * @desc    Get specific integration by provider
 * @access  Private
 */
router.get('/:provider', 
  validation.validateProvider,
  integrationsController.getIntegration
);

/**
 * @route   POST /api/integrations
 * @desc    Create or update integration
 * @access  Private
 */
router.post('/',
  validation.validateIntegrationCreate,
  integrationsController.createIntegration
);

/**
 * @route   POST /api/integrations/:provider/test
 * @desc    Test integration connection
 * @access  Private
 */
router.post('/:provider/test',
  validation.validateProvider,
  integrationsController.testIntegration
);

/**
 * @route   POST /api/integrations/:provider/sync
 * @desc    Sync data from integration
 * @access  Private
 */
router.post('/:provider/sync',
  validation.validateProvider,
  validation.validateSyncRequest,
  integrationsController.syncIntegration
);

/**
 * @route   PUT /api/integrations/:provider/disable
 * @desc    Disable integration
 * @access  Private
 */
router.put('/:provider/disable',
  validation.validateProvider,
  integrationsController.disableIntegration
);

/**
 * @route   DELETE /api/integrations/:provider
 * @desc    Delete integration
 * @access  Private
 */
router.delete('/:provider',
  validation.validateProvider,
  integrationsController.deleteIntegration
);

/**
 * @route   GET /api/integrations/:provider/logs
 * @desc    Get integration logs
 * @access  Private
 */
router.get('/:provider/logs',
  validation.validateProvider,
  integrationsController.getIntegrationLogs
);

module.exports = router;
