const express = require('express');
const router = express.Router();
const facebookService = require('../services/facebook.service');
const facebookLeadProcessor = require('../services/facebookLeadProcessor.service');
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
      
      // Determine frontend URL
      const frontendUrl = 'http://localhost:5173';

      // Redirect to frontend with error status
      const redirectUrl = `${frontendUrl}/integration/callback?status=error&error=${encodeURIComponent(`Facebook OAuth error: ${error}`)}`;
      
      return res.redirect(redirectUrl);
    }

    if (!code || !state) {
      // Determine frontend URL
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

      // Redirect to frontend with error status
      const redirectUrl = `${frontendUrl}/integration/callback?status=error&error=${encodeURIComponent('Missing required parameters (code or state)')}`;
      
      return res.redirect(redirectUrl);
    }

    // Decode state
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { userId, organizationId } = stateData;

    // Exchange code for access token and create integration
    const integration = await facebookService.handleOAuthCallback(code, state);

    // Determine frontend URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Redirect to frontend with success status
    const redirectUrl = `${frontendUrl}/integration/callback?status=success&integration=${integration._id}&fbUserId=${integration.fbUserId}&fbUserName=${encodeURIComponent(integration.fbUserName)}&pagesCount=${integration.fbPages?.length || 0}`;
    
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('Error handling Facebook OAuth callback:', error.message, error.response?.data);
    
    // Determine frontend URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Redirect to frontend with error status
    const redirectUrl = `${frontendUrl}/integration/callback?status=error&error=${encodeURIComponent(error.message)}`;
    
    res.redirect(redirectUrl);
  }
});

// Facebook webhook endpoint (NO AUTH REQUIRED)
router.get('/webhook', (req, res) => {
  // Webhook verification
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Check if a token and mode is in the query string of the request
  if (mode && token) {
    // Check the mode and token sent is correct
    if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
      // Respond with the challenge token from the request
      logger.info('Facebook webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      // Respond with '403 Forbidden' if verify tokens do not match
      logger.error('Facebook webhook verification failed');
      res.sendStatus(403);
    }
  } else {
    logger.error('Facebook webhook verification - missing parameters');
    res.sendStatus(403);
  }
});

// Handle Facebook webhook events (NO AUTH REQUIRED)
router.post('/webhook', async (req, res) => {
  try {
    // Log the entire incoming payload
    logger.info('📥 Incoming Facebook Webhook:', JSON.stringify(req.body, null, 2));

    // Respond immediately to Facebook
    res.status(200).send('OK');

    // Process webhook data asynchronously
    const body = req.body;

    if (body.object === 'page') {
      // Process each entry
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'leadgen') {
            // Process lead generation webhook
            try {
              await facebookLeadProcessor.processWebhookLead(change.value);
              logger.info('✅ Lead processed successfully:', change.value.leadgen_id);
            } catch (error) {
              logger.error('❌ Error processing lead:', change.value.leadgen_id, error.message);
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error('Facebook webhook processing error:', error);
    // Don't change the response - Facebook expects 200
  }
});

// Apply authentication to all OTHER routes
router.use(authenticateUser);

// Get connected pages (MUST be before parameterized routes)
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

    // Fetch lead forms for each page
    const pagesWithForms = await Promise.all(
      (integration.fbPages || []).map(async (page) => {
        try {
          const forms = await facebookService.getPageLeadForms(integration, page.id);
          return {
            ...page.toObject(),
            leadForms: forms || []
          };
        } catch (error) {
          logger.warn(`Failed to fetch forms for page ${page.id}:`, error.message);
          return {
            ...page.toObject(),
            leadForms: []
          };
        }
      })
    );

    res.json({
      success: true,
      pages: pagesWithForms
    });
  } catch (error) {
    logger.error('Error fetching Facebook pages:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pages'
    });
  }
});

// Sync pages from Facebook (MUST be before parameterized routes)
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

// Disconnect Facebook account (MUST be before parameterized routes)
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
router.put('/:id', async (req, res) => {
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
    ).select('-userAccessToken -webhookSecret');

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    res.json({
      success: true,
      integration,
      message: 'Integration settings updated successfully'
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

// Enable/disable form  - simple disabledFormIds array
router.put('/:id/pages/:pageId/forms/:formId/toggle', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id, pageId, formId } = req.params;
    const { enabled } = req.body;

    let updateQuery;
    if (enabled) {
      // Remove from disabled list (enable form)
      updateQuery = {
        $pull: { disabledFormIds: formId },
        $set: { updatedAt: new Date() }
      };
    } else {
      // Add to disabled list (disable form)
      updateQuery = {
        $addToSet: { disabledFormIds: formId },
        $set: { updatedAt: new Date() }
      };
    }

    const updateResult = await FacebookIntegration.updateOne(
      {
        _id: id,
        organizationId,
        'fbPages.id': pageId
      },
      updateQuery
    );

    if (updateResult.modifiedCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    res.json({
      success: true,
      message: `Form ${enabled ? 'enabled' : 'disabled'} successfully`
    });
  } catch (error) {
    logger.error('Error toggling form:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle form',
      error: error.message
    });
  }
});

// Manually process form leads (simplified)
router.post('/:id/pages/:pageId/forms/:formId/process-leads', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id, pageId, formId } = req.params;
    const { since, limit = 50 } = req.body;

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

    const result = await facebookLeadProcessor.processFormLeads(
      integration, 
      pageId, 
      formId, 
      { since, limit }
    );

    res.json({
      success: true,
      message: 'Lead processing completed',
      ...result
    });
  } catch (error) {
    logger.error('Error processing form leads:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to process leads',
      error: error.message
    });
  }
});

// Get form statistics (simplified for old Jesty approach)
router.get('/:id/pages/:pageId/forms/:formId/stats', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id, pageId, formId } = req.params;

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

    const page = integration.fbPages.find(p => p.id === pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        message: 'Page not found'
      });
    }

    // Check if form is disabled (old Jesty approach)
    const isEnabled = !integration.disabledFormIds.includes(formId);

    // Get form details from Facebook API
    const facebookService = require('../services/facebook.service');
    const formDetails = await facebookService.getFormDetails(page.accessToken, formId);

    res.json({
      success: true,
      formInfo: {
        id: formId,
        name: formDetails?.name || 'Unknown Form',
        enabled: isEnabled,
        totalLeads: integration.totalLeads || 0,
        lastLeadReceived: integration.lastLeadReceived
      }
    });
  } catch (error) {
    logger.error('Error fetching form stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch form statistics',
      error: error.message
    });
  }
});

// Update assignment settings
router.put('/:id/assignment', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { assignmentSettings } = req.body;

    if (!assignmentSettings) {
      return res.status(400).json({
        success: false,
        message: 'Assignment settings are required'
      });
    }

    const integration = await FacebookIntegration.findOneAndUpdate(
      { _id: id, organizationId },
      {
        assignmentSettings,
        updatedAt: new Date()
      },
      { new: true }
    ).select('-userAccessToken');

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    logger.info('Facebook integration assignment settings updated', {
      integrationId: id,
      organizationId,
      enabled: assignmentSettings.enabled,
      algorithm: assignmentSettings.algorithm,
      userCount: assignmentSettings.assignToUsers?.length || 0
    });

    res.json({
      success: true,
      message: 'Assignment settings updated successfully',
      assignmentSettings: integration.assignmentSettings
    });
  } catch (error) {
    logger.error('Error updating assignment settings:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update assignment settings'
    });
  }
});

// Enable/disable assignment
router.put('/:id/assignment/toggle', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Enabled field must be a boolean'
      });
    }

    const integration = await FacebookIntegration.findOneAndUpdate(
      { _id: id, organizationId },
      {
        'assignmentSettings.enabled': enabled,
        updatedAt: new Date()
      },
      { new: true }
    ).select('-userAccessToken');

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    res.json({
      success: true,
      message: `Assignment ${enabled ? 'enabled' : 'disabled'} successfully`,
      enabled: integration.assignmentSettings.enabled
    });
  } catch (error) {
    logger.error('Error toggling assignment:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle assignment'
    });
  }
});

// Add user to assignment pool
router.post('/:id/assignment/users', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { userId, weight = 1, isActive = true } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const integration = await FacebookIntegration.findOne({ _id: id, organizationId });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    // Check if user already exists in assignment pool
    const existingUserIndex = integration.assignmentSettings.assignToUsers.findIndex(
      user => user.userId.toString() === userId
    );

    if (existingUserIndex !== -1) {
      // Update existing user
      integration.assignmentSettings.assignToUsers[existingUserIndex] = {
        userId,
        weight,
        isActive
      };
    } else {
      // Add new user
      integration.assignmentSettings.assignToUsers.push({
        userId,
        weight,
        isActive
      });
    }

    integration.updatedAt = new Date();
    await integration.save();

    res.json({
      success: true,
      message: 'User added to assignment pool successfully',
      assignToUsers: integration.assignmentSettings.assignToUsers
    });
  } catch (error) {
    logger.error('Error adding user to assignment pool:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to add user to assignment pool'
    });
  }
});

// Remove user from assignment pool
router.delete('/:id/assignment/users/:userId', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id, userId } = req.params;

    const integration = await FacebookIntegration.findOneAndUpdate(
      { _id: id, organizationId },
      {
        $pull: {
          'assignmentSettings.assignToUsers': { userId }
        },
        updatedAt: new Date()
      },
      { new: true }
    ).select('-userAccessToken');

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    res.json({
      success: true,
      message: 'User removed from assignment pool successfully',
      assignToUsers: integration.assignmentSettings.assignToUsers
    });
  } catch (error) {
    logger.error('Error removing user from assignment pool:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to remove user from assignment pool'
    });
  }
});

// Get assignment statistics
router.get('/:id/assignment/stats', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await FacebookIntegration.findOne({
      _id: id,
      organizationId
    }).select('assignmentSettings totalLeads lastLeadReceived');

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const stats = {
      enabled: integration.assignmentSettings.enabled,
      algorithm: integration.assignmentSettings.algorithm,
      totalUsers: integration.assignmentSettings.assignToUsers?.length || 0,
      activeUsers: integration.assignmentSettings.assignToUsers?.filter(u => u.isActive)?.length || 0,
      totalLeads: integration.totalLeads || 0,
      lastLeadReceived: integration.lastLeadReceived,
      lastAssignment: integration.assignmentSettings.lastAssignment
    };

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('Error fetching assignment stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch assignment statistics'
    });
  }
});

module.exports = router;
