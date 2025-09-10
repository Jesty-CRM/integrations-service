const express = require('express');
const router = express.Router();
const facebookService = require('../services/facebook.service');
const FacebookIntegration = require('../models/FacebookIntegration');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const logger = require('../utils/logger');

// Get Facebook integrations for organization
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    
    const integrations = await FacebookIntegration.find({
      organizationId,
      isDeleted: false
    }).select('-accessToken -webhookSecret').sort({ createdAt: -1 });

    res.json({
      success: true,
      integrations
    });
  } catch (error) {
    logger.error('Error fetching Facebook integrations:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integrations'
    });
  }
});

// Get specific Facebook integration
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await FacebookIntegration.findOne({
      _id: id,
      organizationId,
      isDeleted: false
    }).select('-accessToken -webhookSecret');

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
    logger.error('Error fetching Facebook integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integration'
    });
  }
});

// Initiate Facebook OAuth
router.post('/connect', authenticateUser, async (req, res) => {
  try {
    const { userId, organizationId } = req.user;
    
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

// Handle Facebook OAuth callback
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.error('Facebook OAuth error:', error);
      return res.redirect(`${process.env.FRONTEND_URL}/integrations/facebook?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect(`${process.env.FRONTEND_URL}/integrations/facebook?error=missing_parameters`);
    }

    // Decode state
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { userId, organizationId } = stateData;

    // Exchange code for access token and create integration
    const integration = await facebookService.handleOAuthCallback(code, state);

    res.redirect(`${process.env.FRONTEND_URL}/integrations/facebook?success=true&id=${integration._id}`);
  } catch (error) {
    logger.error('Error handling Facebook OAuth callback:', error.message);
    res.redirect(`${process.env.FRONTEND_URL}/integrations/facebook?error=${encodeURIComponent(error.message)}`);
  }
});

// Update integration settings
router.put('/:id', authenticateUser, validateRequest([
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
router.post('/:id/sync-pages', authenticateUser, async (req, res) => {
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
router.get('/:id/pages/:pageId/forms', authenticateUser, async (req, res) => {
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
router.post('/:id/sync-leads', authenticateUser, async (req, res) => {
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
router.post('/:id/test', authenticateUser, async (req, res) => {
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

// Delete integration
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await FacebookIntegration.findOneAndUpdate(
      { _id: id, organizationId },
      { 
        isDeleted: true,
        isActive: false,
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
    logger.error('Error deleting Facebook integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete integration'
    });
  }
});

// Get integration statistics
router.get('/:id/stats', authenticateUser, async (req, res) => {
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

module.exports = router;
