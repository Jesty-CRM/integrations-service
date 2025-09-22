const express = require('express');
const router = express.Router();
const facebookService = require('../services/facebook.service');
const FacebookIntegration = require('../models/FacebookIntegration');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const logger = require('../utils/logger');

// Handle Facebook OAuth callback (NO AUTH REQUIRED) - MUST BE FIRST
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.error('Facebook OAuth error:', error);
      return res.status(400).json({
        success: false,
        message: `Facebook OAuth error: ${error}`,
        error: error,
        query: req.query
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        message: 'Missing required parameters (code or state)',
        received: { code: !!code, state: !!state }
      });
    }

    // Decode state
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { userId, organizationId } = stateData;

    // Exchange code for access token and create integration
    const integration = await facebookService.handleOAuthCallback(code, state);

    res.json({
      success: true,
      message: 'Facebook account connected successfully!',
      data: {
        integrationId: integration._id,
        fbUserId: integration.fbUserId,
        fbUserName: integration.fbUserName,
        connected: integration.connected,
        pagesCount: integration.fbPages?.length || 0,
        pages: integration.fbPages?.map(page => ({
          id: page.id,
          name: page.name,
          leadFormsCount: page.leadForms?.length || 0
        })) || []
      }
    });
  } catch (error) {
    logger.error('Error handling Facebook OAuth callback:', error.message, error.response?.data);
    res.status(500).json({
      success: false,
      message: 'Failed to connect Facebook account',
      error: error.message,
      details: error.response?.data
    });
  }
});

// Apply authentication to all OTHER routes
router.use(authenticateUser);

// Get Facebook integration for organization (single account)
router.get('/', async (req, res) => {
  try {
    const { organizationId } = req.user;
    
    const integration = await FacebookIntegration.findOne({
      organizationId
    }).select('-userAccessToken');

    res.json({
      success: true,
      integration,
      connected: !!integration && integration.connected
    });
  } catch (error) {
    logger.error('Error fetching Facebook integration:', error.message, 'Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integration',
      error: error.message
    });
  }
});

// Get specific Facebook integration
router.get('/:id', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await FacebookIntegration.findOne({
      _id: id,
      organizationId
    }).select('-userAccessToken -tokenExpiresAt');

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
    logger.error('Error fetching Facebook integration:', error.message, 'Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integration',
      error: error.message
    });
  }
});

// Initiate Facebook OAuth
router.post('/connect', async (req, res) => {
  try {
    const { id: userId, organizationId } = req.user;
    
    // Check if integration already exists for this organization
    const existingIntegration = await FacebookIntegration.findOne({ organizationId });
    if (existingIntegration && existingIntegration.connected) {
      return res.status(400).json({
        success: false,
        message: 'Facebook account is already connected for this organization. Disconnect the current account first.'
      });
    }
    
    const state = Buffer.from(JSON.stringify({
      userId,
      organizationId,
      timestamp: Date.now()
    })).toString('base64');

    const authUrl = facebookService.generateOAuthURL(state);

    res.json({
      success: true,
      authUrl,
      state
    });
  } catch (error) {
    logger.error('Error generating Facebook OAuth URL:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate authorization URL'
    });
  }
});

// Update integration settings
router.put('/:id', validateRequest([
  'leadSettings',
  'syncSettings'
]), async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const integration = await FacebookIntegration.findOneAndUpdate(
      { _id: id, organizationId },
      {
        ...updates,
        updatedAt: new Date()
      },
      { new: true }
    ).select('-accessToken -webhookSecret');

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
    logger.error('Error updating Facebook integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update integration'
    });
  }
});

// Sync Facebook pages
router.post('/:id/sync-pages', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await FacebookIntegration.findOne({
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

    const pages = await facebookService.syncPages(integration);

    res.json({
      success: true,
      pages,
      message: 'Pages synced successfully'
    });
  } catch (error) {
    logger.error('Error syncing Facebook pages:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to sync pages'
    });
  }
});

// Get page lead forms
router.get('/:id/pages/:pageId/forms', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id, pageId } = req.params;

    const integration = await FacebookIntegration.findOne({
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

    const forms = await facebookService.getPageLeadForms(integration, pageId);

    res.json({
      success: true,
      forms
    });
  } catch (error) {
    logger.error('Error fetching page lead forms:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch lead forms'
    });
  }
});

// Sync leads from Facebook
router.post('/:id/sync-leads', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { since, formId } = req.body;

    const integration = await FacebookIntegration.findOne({
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

    const result = await facebookService.syncLeads(integration, { since, formId });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('Error syncing Facebook leads:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to sync leads'
    });
  }
});

// Test integration connection
router.post('/:id/test', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await FacebookIntegration.findOne({
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

    const isValid = await facebookService.testConnection(integration);

    res.json({
      success: true,
      isValid,
      message: isValid ? 'Connection is working' : 'Connection failed'
    });
  } catch (error) {
    logger.error('Error testing Facebook integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to test integration'
    });
  }
});

// Disconnect Facebook account
router.post('/disconnect', async (req, res) => {
  try {
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOneAndDelete({ organizationId });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'No Facebook integration found'
      });
    }

    res.json({
      success: true,
      message: 'Facebook account disconnected successfully'
    });
  } catch (error) {
    logger.error('Error disconnecting Facebook:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect Facebook account'
    });
  }
});

// Get connected pages
router.get('/pages', async (req, res) => {
  try {
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId });

    if (!integration || !integration.connected) {
      return res.status(404).json({
        success: false,
        message: 'Facebook account not connected'
      });
    }

    res.json({
      success: true,
      pages: integration.fbPages || []
    });
  } catch (error) {
    logger.error('Error fetching Facebook pages:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pages'
    });
  }
});

// Sync pages from Facebook
router.post('/sync-pages', async (req, res) => {
  try {
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId });

    if (!integration || !integration.connected) {
      return res.status(404).json({
        success: false,
        message: 'Facebook account not connected'
      });
    }

    const pages = await facebookService.syncPages(integration);

    res.json({
      success: true,
      pages,
      message: 'Pages synced successfully'
    });
  } catch (error) {
    logger.error('Error syncing Facebook pages:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to sync pages'
    });
  }
});

// Get integration statistics
router.get('/:id/stats', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { period = '30d' } = req.query;

    const integration = await FacebookIntegration.findOne({
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
      endDate: new Date()
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Error fetching Facebook integration stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics'
    });
  }
});

// Debug endpoint to test Facebook API permissions
router.get('/:id/debug/permissions', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await FacebookIntegration.findOne({
      _id: id,
      organizationId
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const debugInfo = await facebookService.debugPermissions(integration);

    res.json({
      success: true,
      debugInfo
    });
  } catch (error) {
    logger.error('Error debugging Facebook permissions:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to debug permissions',
      error: error.message
    });
  }
});

module.exports = router;
