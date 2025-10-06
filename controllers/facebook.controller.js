const express = require('express');
const router = express.Router();
const facebookService = require('../services/facebook.service');
const facebookLeadProcessor = require('../services/facebookLeadProcessor.service');
const FacebookIntegration = require('../models/FacebookIntegration');
const { authenticateUser } = require('../middleware/auth');
const logger = require('../utils/logger');

// =============================================================================
// PUBLIC ROUTES (NO AUTH REQUIRED)
// =============================================================================

// Handle Facebook OAuth callback
router.get('/oauth/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.error('Facebook OAuth error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const redirectUrl = `${frontendUrl}/integration/callback?status=error&error=${encodeURIComponent(error)}`;
      return res.redirect(redirectUrl);
    }

    if (!code || !state) {
      const errorMessage = 'Missing authorization code or state parameter';
      logger.error('Facebook OAuth error:', errorMessage);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
      const redirectUrl = `${frontendUrl}/integration/callback?status=error&error=${encodeURIComponent(errorMessage)}`;
      return res.redirect(redirectUrl);
    }

    // Process OAuth callback
    const integration = await facebookService.handleOAuthCallback(code, state);

    logger.info('Facebook integration created successfully:', { 
      integrationId: integration._id, 
      pagesCount: integration.fbPages?.length || 0 
    });

    // Redirect to frontend with success status
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = `${frontendUrl}/integration/callback?status=success&integration=${integration._id}`;
    
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('Error handling Facebook OAuth callback:', error.message);
    
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const redirectUrl = `${frontendUrl}/integration/callback?status=error&error=${encodeURIComponent(error.message)}`;
    
    res.redirect(redirectUrl);
  }
});

// Facebook webhook verification
router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
      logger.info('Facebook webhook verified successfully');
      res.status(200).send(challenge);
    } else {
      logger.error('Facebook webhook verification failed - invalid token');
      res.sendStatus(403);
    }
  } else {
    logger.error('Facebook webhook verification - missing parameters');
    res.sendStatus(403);
  }
});

// Handle Facebook webhook events
router.post('/webhook', async (req, res) => {
  try {
    logger.info('📥 Incoming Facebook Webhook:', JSON.stringify(req.body, null, 2));

    // Respond immediately to Facebook
    res.status(200).send('OK');

    // Process webhook data asynchronously
    const body = req.body;

    if (body.object === 'page') {
      for (const entry of body.entry) {
        for (const change of entry.changes) {
          if (change.field === 'leadgen') {
            const leadgenData = change.value;
            logger.info('Processing leadgen webhook:', leadgenData);
            
            // Process the lead asynchronously
            facebookLeadProcessor.processWebhookLead(leadgenData).catch(error => {
              logger.error('Error processing Facebook webhook lead:', error);
            });
          }
        }
      }
    }
  } catch (error) {
    logger.error('Facebook webhook processing error:', error);
    // Don't change the response - Facebook expects 200
  }
});

// =============================================================================
// AUTHENTICATED ROUTES
// =============================================================================

router.use(authenticateUser);

// Initiate Facebook OAuth connection
router.post('/connect', async (req, res) => {
  try {
    const { userId, organizationId } = req.user;

    // Create state parameter with user info and timestamp
    const state = Buffer.from(JSON.stringify({ 
      userId, 
      organizationId,
      timestamp: Date.now()
    })).toString('base64');

    // Generate OAuth URL
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
      message: 'Failed to generate OAuth URL'
    });
  }
});

// Get Facebook integration status
router.get('/', async (req, res) => {
  try {
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId }).select('-userAccessToken');
    
    if (!integration) {
      return res.json({
        success: true,
        connected: false,
        integration: null
      });
    }

    res.json({
      success: true,
      connected: integration.connected,
      integration: {
        id: integration.id,
        userId: integration.userId, // Include userId in response
        organizationId: integration.organizationId,
        fbUserId: integration.fbUserId,
        fbUserName: integration.fbUserName,
        fbUserPicture: integration.fbUserPicture,
        pagesCount: integration.fbPages?.length || 0,
        totalLeads: integration.totalLeads,
        lastSync: integration.lastSync,
        createdAt: integration.createdAt,
        stats: integration.stats,
        creatorInfo: integration.getCreatorInfo() // Include creator information
      }
    });
  } catch (error) {
    logger.error('Error getting Facebook integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get integration status'
    });
  }
});

// Get Facebook integrations by user
router.get('/by-user/:userId?', async (req, res) => {
  try {
    const { userId: paramUserId } = req.params;
    const userId = paramUserId || req.user.id || req.user._id; // Use param or current user
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const integrations = await FacebookIntegration.findByUser(userId).select('-userAccessToken');
    
    res.json({
      success: true,
      count: integrations.length,
      integrations: integrations.map(integration => ({
        id: integration.id,
        _id: integration._id,
        userId: integration.userId,
        organizationId: integration.organizationId,
        fbUserId: integration.fbUserId,
        fbUserName: integration.fbUserName,
        fbUserPicture: integration.fbUserPicture,
        connected: integration.connected,
        pagesCount: integration.fbPages?.length || 0,
        totalLeads: integration.totalLeads,
        lastSync: integration.lastSync,
        createdAt: integration.createdAt,
        stats: integration.stats
      }))
    });
  } catch (error) {
    logger.error('Error getting user Facebook integrations:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get user integrations'
    });
  }
});

// Get connected pages with forms (fast - returns existing data)
router.get('/pages', async (req, res) => {
  try {
    const { organizationId, userId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId });

    if (!integration || !integration.connected) {
      return res.status(404).json({
        success: false,
        message: 'Facebook account not connected'
      });
    }

    // Ensure integration has proper userId field
    if (!integration.userId) {
      logger.warn('Integration missing userId, setting from request');
      integration.userId = userId;
      try {
        await integration.save();
        logger.info('UserId updated successfully');
      } catch (saveError) {
        logger.error('Failed to update userId:', saveError.message);
      }
    }

    // Return existing pages data (no auto-sync to keep it fast)
    logger.info('Returning cached Facebook pages and forms...');
    const pages = integration.fbPages || [];

    res.json({
      success: true,
      pages: pages,
      lastSync: integration.lastSync,
      message: pages.length === 0 ? 'No pages found. Use manual sync to fetch latest data.' : 'Pages retrieved from cache'
    });
  } catch (error) {
    logger.error('Error fetching Facebook pages:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pages'
    });
  }
});

// Get sync status and recommendations
router.get('/sync-status', async (req, res) => {
  try {
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId });

    if (!integration || !integration.connected) {
      return res.status(404).json({
        success: false,
        message: 'Facebook account not connected'
      });
    }

    const now = new Date();
    const lastSync = integration.lastSync ? new Date(integration.lastSync) : null;
    const hoursSinceLastSync = lastSync ? Math.floor((now - lastSync) / (1000 * 60 * 60)) : null;
    
    // Recommend sync if more than 24 hours old or no sync yet
    const recommendSync = !lastSync || hoursSinceLastSync > 24;
    
    // Check token validity
    const tokenExpired = integration.tokenExpiresAt && now > integration.tokenExpiresAt;
    const tokenExpiringSoon = integration.tokenExpiresAt && 
      (integration.tokenExpiresAt - now) < (7 * 24 * 60 * 60 * 1000); // 7 days

    res.json({
      success: true,
      data: {
        lastSync: lastSync,
        hoursSinceLastSync: hoursSinceLastSync,
        recommendSync: recommendSync,
        pagesCount: integration.fbPages?.length || 0,
        totalForms: integration.fbPages?.reduce((sum, page) => sum + (page.leadForms?.length || 0), 0) || 0,
        tokenStatus: {
          isValid: !tokenExpired,
          expiringSoon: tokenExpiringSoon,
          expiresAt: integration.tokenExpiresAt
        }
      },
      message: recommendSync ? 
        'Sync recommended - data may be outdated' : 
        'Data is up to date'
    });
  } catch (error) {
    logger.error('Error getting sync status:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync status'
    });
  }
});

// Manually sync pages from Facebook
router.post('/sync-pages', async (req, res) => {
  try {
    const { organizationId, userId } = req.user;

    logger.info('Manual sync initiated by user:', { userId, organizationId });

    const integration = await FacebookIntegration.findOne({ organizationId });

    if (!integration || !integration.connected) {
      return res.status(404).json({
        success: false,
        message: 'Facebook account not connected'
      });
    }

    // Check if token is still valid
    if (!integration.userAccessToken) {
      return res.status(400).json({
        success: false,
        message: 'Facebook access token is missing. Please reconnect your Facebook account.'
      });
    }

    // Check token expiry
    if (integration.tokenExpiresAt && new Date() > integration.tokenExpiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Facebook access token has expired. Please reconnect your Facebook account.'
      });
    }

    logger.info('Starting manual Facebook pages sync...');
    const startTime = Date.now();
    
    const pages = await facebookService.syncPages(integration);
    
    const syncDuration = Date.now() - startTime;
    const totalForms = pages.reduce((sum, page) => sum + (page.leadForms?.length || 0), 0);
    
    logger.info('Manual sync completed:', {
      pagesCount: pages.length,
      totalForms,
      duration: `${syncDuration}ms`
    });

    res.json({
      success: true,
      pages,
      stats: {
        pagesCount: pages.length,
        totalForms,
        syncDuration: `${syncDuration}ms`,
        lastSync: new Date()
      },
      message: `Successfully synced ${pages.length} pages with ${totalForms} total lead forms`
    });
  } catch (error) {
    logger.error('Error during manual sync:', {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
    
    // Provide more specific error messages
    let errorMessage = 'Failed to sync pages';
    if (error.message.includes('access token')) {
      errorMessage = 'Facebook access token is invalid. Please reconnect your account.';
    } else if (error.message.includes('permissions')) {
      errorMessage = 'Insufficient Facebook permissions. Please reconnect with required permissions.';
    } else if (error.message.includes('rate limit')) {
      errorMessage = 'Facebook API rate limit exceeded. Please try again in a few minutes.';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
        message: 'No Facebook integration found to disconnect'
      });
    }

    res.json({
      success: true,
      message: 'Facebook account disconnected successfully'
    });
  } catch (error) {
    logger.error('Error disconnecting Facebook account:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to disconnect Facebook account'
    });
  }
});

// =============================================================================
// FORM ASSIGNMENT MANAGEMENT ROUTES
// =============================================================================

// Get assignment settings for a specific form
router.get('/forms/:formId/assignments', async (req, res) => {
  try {
    const { formId } = req.params;
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId });
    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Facebook integration not found'
      });
    }

    // Find the form across all pages
    let targetForm = null;
    let targetPage = null;

    for (const page of integration.fbPages) {
      const form = page.leadForms.find(f => f.id === formId);
      if (form) {
        targetForm = form;
        targetPage = page;
        break;
      }
    }

    if (!targetForm) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    res.json({
      success: true,
      data: {
        formId: targetForm.id,
        formName: targetForm.name,
        pageId: targetPage.id,
        pageName: targetPage.name,
        enabled: targetForm.enabled,
        crmStatus: targetForm.crmStatus,
        assignmentSettings: targetForm.assignmentSettings,
        stats: targetForm.stats
      }
    });
  } catch (error) {
    logger.error('Error getting form assignment settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get form assignment settings'
    });
  }
});

// Update assignment settings for a specific form
router.put('/forms/:formId/assignments', async (req, res) => {
  try {
    const { formId } = req.params;
    const { organizationId } = req.user;
    const { enabled, algorithm, assignToUsers } = req.body;

    // Validate request body
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'enabled must be a boolean'
      });
    }

    if (algorithm && !['round-robin', 'weighted-round-robin', 'least-assigned', 'random'].includes(algorithm)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid algorithm. Must be one of: round-robin, weighted-round-robin, least-assigned, random'
      });
    }

    if (assignToUsers && !Array.isArray(assignToUsers)) {
      return res.status(400).json({
        success: false,
        message: 'assignToUsers must be an array'
      });
    }

    // Validate assignToUsers structure
    if (assignToUsers) {
      for (const user of assignToUsers) {
        if (!user.userId) {
          return res.status(400).json({
            success: false,
            message: 'Each user must have a userId'
          });
        }
        if (user.weight && (user.weight < 1 || user.weight > 10)) {
          return res.status(400).json({
            success: false,
            message: 'User weight must be between 1 and 10'
          });
        }
      }
    }

    const integration = await FacebookIntegration.findOne({ organizationId });
    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Facebook integration not found'
      });
    }

    // Find and update the form
    let updated = false;
    for (const page of integration.fbPages) {
      const formIndex = page.leadForms.findIndex(f => f.id === formId);
      if (formIndex !== -1) {
        const form = page.leadForms[formIndex];
        
        // Update assignment settings
        if (enabled !== undefined) {
          form.assignmentSettings.enabled = enabled;
        }
        if (algorithm) {
          form.assignmentSettings.algorithm = algorithm;
        }
        if (assignToUsers) {
          form.assignmentSettings.assignToUsers = assignToUsers.map(user => ({
            userId: user.userId,
            weight: user.weight || 1,
            isActive: user.isActive !== undefined ? user.isActive : true
          }));
          // Reset assignment index when users change
          form.assignmentSettings.lastAssignment.lastAssignedIndex = 0;
          form.assignmentSettings.lastAssignment.mode = 'automatic';
        }

        updated = true;
        break;
      }
    }

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    await integration.save();

    res.json({
      success: true,
      message: 'Assignment settings updated successfully',
      data: {
        formId,
        assignmentSettings: integration.fbPages
          .flatMap(page => page.leadForms)
          .find(form => form.id === formId)?.assignmentSettings
      }
    });
  } catch (error) {
    logger.error('Error updating form assignment settings:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update form assignment settings'
    });
  }
});

// Get all forms with their assignment settings
router.get('/forms/assignments', async (req, res) => {
  try {
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId });
    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Facebook integration not found'
      });
    }

    const formsWithAssignments = [];
    
    for (const page of integration.fbPages) {
      for (const form of page.leadForms) {
        formsWithAssignments.push({
          formId: form.id,
          formName: form.name,
          pageId: page.id,
          pageName: page.name,
          enabled: form.enabled,
          crmStatus: form.crmStatus,
          assignmentSettings: form.assignmentSettings,
          stats: form.stats
        });
      }
    }

    res.json({
      success: true,
      data: formsWithAssignments
    });
  } catch (error) {
    logger.error('Error getting all form assignments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get form assignments'
    });
  }
});

// Enable/Disable a specific form
router.patch('/forms/:formId/toggle', async (req, res) => {
  try {
    const { formId } = req.params;
    const { organizationId, userId } = req.user;
    const { enabled, reason } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'enabled must be a boolean'
      });
    }

    const integration = await FacebookIntegration.findOne({ organizationId });
    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Facebook integration not found'
      });
    }

    // Find and update the form
    let updated = false;
    let updatedForm = null;
    
    for (const page of integration.fbPages) {
      const form = page.leadForms.find(f => f.id === formId);
      if (form) {
        // Update form status
        form.enabled = enabled;
        form.crmStatus = enabled ? 'active' : 'disabled';
        
        if (!enabled) {
          // Track who disabled it and when
          form.disabledAt = new Date();
          form.disabledBy = userId;
          form.disabledReason = reason || 'Disabled via API';
        } else {
          // Clear disabled tracking when re-enabling
          form.disabledAt = undefined;
          form.disabledBy = undefined;
          form.disabledReason = undefined;
        }
        
        updatedForm = form;
        updated = true;
        break;
      }
    }

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    await integration.save();

    res.json({
      success: true,
      message: `Form ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: {
        formId,
        formName: updatedForm.name,
        enabled,
        crmStatus: updatedForm.crmStatus,
        disabledAt: updatedForm.disabledAt,
        disabledBy: updatedForm.disabledBy,
        disabledReason: updatedForm.disabledReason
      }
    });
  } catch (error) {
    logger.error('Error toggling form status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle form status'
    });
  }
});

// Get only enabled forms (for lead processing)
router.get('/forms/enabled', async (req, res) => {
  try {
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId });
    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Facebook integration not found'
      });
    }

    const enabledForms = [];
    
    for (const page of integration.fbPages) {
      for (const form of page.leadForms) {
        if (form.enabled && form.crmStatus === 'active') {
          enabledForms.push({
            formId: form.id,
            formName: form.name,
            pageId: page.id,
            pageName: page.name,
            assignmentSettings: form.assignmentSettings,
            stats: form.stats
          });
        }
      }
    }

    res.json({
      success: true,
      data: enabledForms,
      count: enabledForms.length
    });
  } catch (error) {
    logger.error('Error getting enabled forms:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get enabled forms'
    });
  }
});

module.exports = router;