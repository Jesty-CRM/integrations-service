const express = require('express');
const router = express.Router();
const facebookService = require('../services/facebook.service');
const facebookLeadProcessor = require('../services/facebookLeadProcessor.service');
const FacebookIntegration = require('../models/FacebookIntegration');
const { authenticateUser } = require('../middleware/auth');
const { requireIntegrationAccess } = require('../middleware/permissions');
const { 
  requireBasicAccess, 
  requireLeadsAccess,
  requirePageManagement 
} = require('../middleware/facebookPermissions');
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

// Check permissions status
router.get('/permissions', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId });

    if (!integration || !integration.connected) {
      return res.status(404).json({
        success: false,
        message: 'Facebook account not connected'
      });
    }

    const grantedPermissions = integration.grantedPermissions || [];
    const advancedPermissions = ['ads_management', 'business_management', 'ads_read', 'read_insights'];
    const basicPermissions = ['pages_show_list', 'leads_retrieval', 'pages_read_engagement'];
    
    const analysis = {
      total: grantedPermissions.length,
      granted: grantedPermissions,
      hasBasic: basicPermissions.every(perm => grantedPermissions.includes(perm)),
      hasAdvanced: advancedPermissions.some(perm => grantedPermissions.includes(perm)),
      basicGranted: basicPermissions.filter(perm => grantedPermissions.includes(perm)),
      basicMissing: basicPermissions.filter(perm => !grantedPermissions.includes(perm)),
      advancedGranted: advancedPermissions.filter(perm => grantedPermissions.includes(perm)),
      advancedMissing: advancedPermissions.filter(perm => !grantedPermissions.includes(perm)),
      canManageAds: grantedPermissions.includes('ads_management'),
      canReadAds: grantedPermissions.includes('ads_read'),
      canAccessBusiness: grantedPermissions.includes('business_management')
    };

    res.json({
      success: true,
      permissions: analysis,
      message: analysis.hasAdvanced ? 
        'Advanced permissions available' : 
        'Only basic permissions available - may need App Review for advanced features'
    });
  } catch (error) {
    logger.error('Error checking Facebook permissions:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to check permissions'
    });
  }
});

// Get connected pages with forms (fast - returns existing data)
router.get('/pages', authenticateUser, requireIntegrationAccess(), requireBasicAccess(), async (req, res) => {
  try {
    const { organizationId, userId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId });

    if (!integration || !integration.connected) {
      return res.status(404).json({
        success: false,
        message: 'Facebook account not connected'
      });
    }

    // Ensure integration has proper userId field (only update if truly missing)
    if (!integration.userId && userId) {
      logger.warn('Integration missing userId, setting from request', {
        organizationId: integration.organizationId,
        integrationId: integration._id
      });
      
      try {
        await FacebookIntegration.findByIdAndUpdate(integration._id, {
          userId: userId
        });
        integration.userId = userId; // Update the in-memory object
        logger.info('UserId updated successfully', {
          organizationId: integration.organizationId,
          userId
        });
      } catch (saveError) {
        logger.error('Failed to update userId:', {
          error: saveError.message,
          organizationId: integration.organizationId,
          userId
        });
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
router.get('/sync-status', authenticateUser, requireBasicAccess(), async (req, res) => {
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

// Setup webhooks for all pages
router.post('/setup-webhooks', authenticateUser, requireBasicAccess(), async (req, res) => {
  try {
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId });
    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Facebook integration not found'
      });
    }

    if (!integration.fbPages || integration.fbPages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No Facebook pages found. Please sync pages first.'
      });
    }

    logger.info(`Setting up webhooks for ${integration.fbPages.length} pages for organization ${organizationId}`);

    const result = await facebookService.setupWebhooksForAllPages(integration);

    res.json({
      success: result.success,
      message: result.success 
        ? `Webhook setup completed. Success: ${result.successCount}, Failures: ${result.failureCount}`
        : 'Failed to setup webhooks',
      data: {
        successCount: result.successCount,
        failureCount: result.failureCount,
        totalPages: result.totalPages
      }
    });

  } catch (error) {
    logger.error('Error setting up Facebook webhooks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to setup webhooks',
      error: error.message
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
router.get('/forms/:formId/assignments', authenticateUser, requireLeadsAccess(), async (req, res) => {
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

// =============================================================================
// MIGRATION ROUTES (ADMIN ONLY)
// =============================================================================

// Migration endpoint to fix missing userId in existing integrations
router.post('/migrate-userId', authenticateUser, async (req, res) => {
  try {
    const { organizationId, userId } = req.user;
    
    // Only allow admin users to run migration
    if (!req.user.roles?.includes('admin') && !req.user.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required for migration'
      });
    }

    logger.info('Starting Facebook userId migration', { userId, organizationId });
    
    const result = await facebookService.migrateExistingIntegrations();
    
    res.json({
      success: true,
      data: result,
      message: 'Facebook integration migration completed'
    });
  } catch (error) {
    logger.error('Error running Facebook migration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to run migration'
    });
  }
});

// Clean up duplicate Facebook integrations (admin only)
router.post('/cleanup-duplicates', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;

    // Find current integration
    const currentIntegration = await FacebookIntegration.findOne({ organizationId });
    
    if (!currentIntegration || !currentIntegration.fbUserId) {
      return res.status(404).json({
        success: false,
        message: 'No Facebook integration found for this organization'
      });
    }

    // Clean up duplicates
    const result = await facebookService.cleanupDuplicateIntegrations(
      currentIntegration.fbUserId, 
      organizationId
    );

    res.json({
      success: true,
      message: result.message,
      data: {
        fbUserId: currentIntegration.fbUserId,
        fbUserName: currentIntegration.fbUserName,
        keptIntegration: {
          integrationId: currentIntegration._id,
          organizationId: organizationId
        },
        removedCount: result.removedCount,
        removedIntegrations: result.removedIntegrations
      }
    });
  } catch (error) {
    logger.error('Error cleaning up Facebook duplicates:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to cleanup duplicate integrations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Check for duplicate Facebook integrations
router.get('/check-duplicates', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;

    // Find current integration
    const currentIntegration = await FacebookIntegration.findOne({ organizationId });
    
    if (!currentIntegration || !currentIntegration.fbUserId) {
      return res.status(404).json({
        success: false,
        message: 'No Facebook integration found for this organization'
      });
    }

    // Find duplicates
    const duplicates = await FacebookIntegration.find({
      fbUserId: currentIntegration.fbUserId,
      organizationId: { $ne: organizationId }
    }).select('_id organizationId fbUserName connected createdAt');

    res.json({
      success: true,
      data: {
        fbUserId: currentIntegration.fbUserId,
        fbUserName: currentIntegration.fbUserName,
        currentIntegration: {
          integrationId: currentIntegration._id,
          organizationId: organizationId,
          connected: currentIntegration.connected
        },
        duplicatesCount: duplicates.length,
        duplicates: duplicates.map(dup => ({
          integrationId: dup._id,
          organizationId: dup.organizationId,
          fbUserName: dup.fbUserName,
          connected: dup.connected,
          createdAt: dup.createdAt
        })),
        hasDuplicates: duplicates.length > 0
      },
      message: duplicates.length > 0 
        ? `Found ${duplicates.length} duplicate Facebook integrations` 
        : 'No duplicate integrations found'
    });
  } catch (error) {
    logger.error('Error checking Facebook duplicates:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to check for duplicate integrations'
    });
  }
});

// Check migration status
router.get('/migration-status', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    
    // Count integrations that need migration
    const needsMigration = await FacebookIntegration.countDocuments({
      $or: [
        { userId: { $exists: false } },
        { userId: null },
        { needsUserMigration: true }
      ]
    });
    
    // Count total integrations
    const totalIntegrations = await FacebookIntegration.countDocuments({});
    
    // Count integrations with userId properly set
    const properlyConfigured = await FacebookIntegration.countDocuments({
      userId: { $exists: true, $ne: null }
    });
    
    res.json({
      success: true,
      data: {
        totalIntegrations,
        needsMigration,
        properlyConfigured,
        migrationNeeded: needsMigration > 0
      },
      message: needsMigration > 0 
        ? `${needsMigration} integrations need userId migration`
        : 'All integrations have proper userId configuration'
    });
  } catch (error) {
    logger.error('Error checking migration status:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to check migration status'
    });
  }
});

// =============================================================================
// FACEBOOK PERMISSIONS MANAGEMENT
// =============================================================================

// Check current Facebook permissions status
router.get('/permissions', authenticateUser, requireBasicAccess(), async (req, res) => {
  try {
    const integration = req.facebookIntegration; // Set by requireBasicAccess middleware
    
    res.json({
      success: true,
      data: {
        integrationId: integration._id,
        connected: integration.connected,
        grantedPermissions: integration.grantedPermissions || [],
        fbUserName: integration.fbUserName,
        lastSync: integration.lastSync,
        tokenExpiresAt: integration.tokenExpiresAt,
        permissionStatus: {
          basic: integration.grantedPermissions?.includes('pages_show_list') || false,
          leads: integration.grantedPermissions?.includes('leads_retrieval') || false,
          pageManagement: integration.grantedPermissions?.includes('pages_manage_metadata') || false,
          adsRead: integration.grantedPermissions?.includes('ads_read') || false,
          adsManage: integration.grantedPermissions?.includes('pages_manage_ads') || false,
          business: integration.grantedPermissions?.includes('business_management') || false
        }
      }
    });
  } catch (error) {
    logger.error('Error fetching Facebook permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Facebook permissions',
      error: error.message
    });
  }
});

// =============================================================================
// HISTORICAL LEAD IMPORT ROUTES
// =============================================================================

// Import historical Facebook leads with preset periods (24hours, 7days, 30days, 90days) or custom range
router.post('/import-historical', authenticateUser, requireLeadsAccess(), async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { 
      period = '30days', // '24hours', '7days', '30days', '90days', 'custom'
      customStartDate = null, // For custom period - YYYY-MM-DD format
      customEndDate = null    // For custom period - YYYY-MM-DD format
    } = req.body;

    // Validate period parameter
    const validPeriods = ['24hours', '7days', '30days', '90days', 'custom'];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({
        success: false,
        message: `Invalid period. Valid options: ${validPeriods.join(', ')}`
      });
    }

    // Validate custom dates if period is custom
    if (period === 'custom') {
      if (!customStartDate || !customEndDate) {
        return res.status(400).json({
          success: false,
          message: 'Custom period requires both customStartDate and customEndDate in YYYY-MM-DD format'
        });
      }

      // Validate date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(customStartDate) || !dateRegex.test(customEndDate)) {
        return res.status(400).json({
          success: false,
          message: 'Date format must be YYYY-MM-DD'
        });
      }

      // Validate date range
      const startDate = new Date(customStartDate);
      const endDate = new Date(customEndDate);
      const now = new Date();

      if (startDate >= endDate) {
        return res.status(400).json({
          success: false,
          message: 'Start date must be before end date'
        });
      }

      if (endDate > now) {
        return res.status(400).json({
          success: false,
          message: 'End date cannot be in the future'
        });
      }

      // Limit custom range to 90 days max
      const diffTime = Math.abs(endDate - startDate);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 90) {
        return res.status(400).json({
          success: false,
          message: 'Custom date range cannot exceed 90 days'
        });
      }
    }

    logger.info('Historical Facebook leads import requested:', {
      organizationId,
      period,
      customStartDate,
      customEndDate,
      userId: req.user.userId
    });

    const integration = await FacebookIntegration.findOne({ organizationId });

    if (!integration || !integration.connected) {
      return res.status(404).json({
        success: false,
        message: 'Facebook integration not found or not connected'
      });
    }

    // Check if token is still valid
    if (!integration.userAccessToken) {
      return res.status(400).json({
        success: false,
        message: 'Facebook access token not available. Please reconnect your Facebook account.'
      });
    }

    // Check token expiry
    if (integration.tokenExpiresAt && new Date() > integration.tokenExpiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Facebook access token has expired. Please reconnect your Facebook account.'
      });
    }

    logger.info('Starting historical import process...');
    const startTime = Date.now();
    
    const result = await facebookService.importHistoricalLeads(integration, {
      period,
      customStartDate,
      customEndDate
    });
    
    const duration = Date.now() - startTime;
    
    logger.info('Historical import completed:', {
      duration: `${duration}ms`,
      processed: result.processed,
      successful: result.successful,
      errors: result.errors
    });

    const periodDescription = period === 'custom' 
      ? `from ${customStartDate} to ${customEndDate}`
      : `from the past ${period.replace('hours', ' hours').replace('days', ' days')}`;

    res.json({
      success: true,
      message: `Successfully imported ${result.successful} leads ${periodDescription}`,
      data: {
        ...result,
        period,
        periodDescription,
        duration: `${duration}ms`,
        importedAt: new Date()
      }
    });

  } catch (error) {
    logger.error('Error during historical Facebook leads import:', {
      message: error.message,
      stack: error.stack,
      organizationId: req.user?.organizationId
    });
    
    // Provide more specific error messages
    let errorMessage = 'Failed to import historical leads';
    if (error.message.includes('access token')) {
      errorMessage = 'Facebook access token issue. Please reconnect your Facebook account.';
    } else if (error.message.includes('No pages available')) {
      errorMessage = 'No Facebook pages found. Please sync your pages first.';
    } else if (error.message.includes('Page') && error.message.includes('not found')) {
      errorMessage = 'Specified Facebook page not found in your integration.';
    }
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get historical import status and recommendations
router.get('/import-historical/status', authenticateUser, requireBasicAccess(), async (req, res) => {
  try {
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId });

    if (!integration || !integration.connected) {
      return res.status(404).json({
        success: false,
        message: 'Facebook integration not found or not connected'
      });
    }

    const now = new Date();
    const lastHistoricalImport = integration.lastHistoricalImport ? new Date(integration.lastHistoricalImport) : null;
    const daysSinceLastImport = lastHistoricalImport ? Math.floor((now - lastHistoricalImport) / (1000 * 60 * 60 * 24)) : null;
    
    // Check token validity
    const tokenExpired = integration.tokenExpiresAt && now > integration.tokenExpiresAt;
    const tokenExpiringSoon = integration.tokenExpiresAt && 
      (integration.tokenExpiresAt - now) < (7 * 24 * 60 * 60 * 1000); // 7 days

    // Get available pages and forms for import
    const availablePages = integration.fbPages || [];
    const totalForms = availablePages.reduce((sum, page) => sum + (page.leadForms?.length || 0), 0);
    const enabledForms = availablePages.reduce((sum, page) => 
      sum + (page.leadForms?.filter(f => f.enabled !== false).length || 0), 0
    );

    res.json({
      success: true,
      data: {
        lastHistoricalImport: lastHistoricalImport,
        daysSinceLastImport: daysSinceLastImport,
        canImport: !tokenExpired && availablePages.length > 0,
        availablePages: availablePages.length,
        totalForms: totalForms,
        enabledForms: enabledForms,
        tokenStatus: {
          isValid: !tokenExpired,
          expiringSoon: tokenExpiringSoon,
          expiresAt: integration.tokenExpiresAt
        },
        recommendations: {
          suggestedDays: lastHistoricalImport ? 
            (daysSinceLastImport > 30 ? 30 : daysSinceLastImport + 1) : 30,
          maxDaysAllowed: 90,
          message: lastHistoricalImport ? 
            `Last import was ${daysSinceLastImport} days ago` : 
            'No historical import has been performed yet'
        }
      }
    });

  } catch (error) {
    logger.error('Error getting historical import status:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get historical import status'
    });
  }
});

module.exports = router;