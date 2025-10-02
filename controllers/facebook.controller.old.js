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

    // Decode state
    const stateData = JSON.parse(Buffer.from(state, 'base64').toString());
    const { userId, organizationId } = stateData;

    logger.info('Processing Facebook OAuth callback:', { userId, organizationId, code: code.substring(0, 10) + '...' });

    // Exchange code for access token and create integration
    const integration = await facebookService.handleOAuthCallback(code, state);

    logger.info('Facebook integration created successfully:', { 
      integrationId: integration._id, 
      pagesCount: integration.fbPages?.length || 0 
    });

    // Determine frontend URL
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    // Redirect to frontend with success status
    const redirectUrl = `${frontendUrl}/integration/callback?status=success&integration=${integration._id}&fbUserId=${integration.fbUserId}&fbUserName=${encodeURIComponent(integration.fbUserName)}&pagesCount=${integration.fbPages?.length || 0}`;
    
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error('Error handling Facebook OAuth callback:', {
      message: error.message,
      stack: error.stack,
      responseData: error.response?.data,
      responseStatus: error.response?.status
    });
    
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

// Apply authentication to all OTHER routes
router.use(authenticateUser);

// Get connected pages (MUST be before parameterized routes)
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
      // Save the userId immediately
      try {
        await integration.save();
        logger.info('UserId updated successfully');
      } catch (saveError) {
        logger.error('Failed to update userId:', saveError.message);
      }
    }

    // Auto-sync pages and forms to ensure latest data
    logger.info('Auto-syncing Facebook pages and forms...');
    const syncedPages = await facebookService.syncPages(integration);

    // Return the synced pages with forms
    res.json({
      success: true,
      pages: syncedPages
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

// Get Facebook integration for organization (single account)
router.get('/', async (req, res) => {
  try {
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({ organizationId }).select('-userAccessToken');

    res.json({
      success: true,
      data: integration
    });
  } catch (error) {
    logger.error('Error fetching Facebook integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integration'
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
    }).select('-userAccessToken');

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    res.json({
      success: true,
      data: integration
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

// Update integration settings
router.put('/:id', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { settings } = req.body;

    const integration = await FacebookIntegration.findOneAndUpdate(
      { _id: id, organizationId },
      { settings, updatedAt: new Date() },
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
      data: integration,
      message: 'Integration updated successfully'
    });
  } catch (error) {
    logger.error('Error updating integration:', error.message);
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

    const integration = await FacebookIntegration.findOne({ _id: id, organizationId });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const pages = await facebookService.syncPages(integration);

    res.json({
      success: true,
      data: pages,
      message: 'Pages synced successfully'
    });
  } catch (error) {
    logger.error('Error syncing pages:', error.message);
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

    const integration = await FacebookIntegration.findOne({ _id: id, organizationId });

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

    res.json({
      success: true,
      data: page.leadForms
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
    const { syncType = 'full' } = req.body;

    const integration = await FacebookIntegration.findOne({ _id: id, organizationId });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const result = await facebookService.syncData(integration, syncType);

    res.json({
      success: true,
      data: result,
      message: 'Leads sync completed'
    });
  } catch (error) {
    logger.error('Error syncing leads:', error.message);
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

    const integration = await FacebookIntegration.findOne({ _id: id, organizationId });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const testResult = await facebookService.testConnection({
      accessToken: integration.userAccessToken
    });

    res.json({
      success: testResult.success,
      data: testResult.data,
      message: testResult.success ? 'Connection test passed' : 'Connection test failed',
      error: testResult.error
    });
  } catch (error) {
    logger.error('Error testing Facebook connection:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to test connection'
    });
  }
});

// Get integration statistics
router.get('/:id/stats', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await FacebookIntegration.findOne({
      _id: id,
      organizationId
    }).select('stats totalLeads lastLeadReceived fbPages');

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    // Calculate form-level stats
    const formStats = [];
    integration.fbPages.forEach(page => {
      page.leadForms.forEach(form => {
        formStats.push({
          pageId: page.id,
          pageName: page.name,
          formId: form.id,
          formName: form.name,
          leadsCount: form.leadsCount || 0,
          enabled: form.enabled,
          stats: form.stats
        });
      });
    });

    res.json({
      success: true,
      data: {
        totalLeads: integration.totalLeads || 0,
        lastLeadReceived: integration.lastLeadReceived,
        stats: integration.stats,
        formStats: formStats
      }
    });
  } catch (error) {
    logger.error('Error fetching integration statistics:', error.message);
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

    const integration = await FacebookIntegration.findOne({ _id: id, organizationId });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const debugInfo = await facebookService.debugPermissions(integration);

    res.json({
      success: true,
      data: debugInfo
    });
  } catch (error) {
    logger.error('Error debugging Facebook permissions:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to debug permissions'
    });
  }
});

// Toggle form enabled/disabled
router.put('/:id/pages/:pageId/forms/:formId/toggle', async (req, res) => {
  try {
    const { id: integrationId, pageId, formId } = req.params;
    const { organizationId } = req.user;
    const { enabled } = req.body;

    const integration = await FacebookIntegration.findOne({
      _id: integrationId,
      organizationId
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    // Find the page and form
    const pageIndex = integration.fbPages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Page not found'
      });
    }

    const formIndex = integration.fbPages[pageIndex].leadForms.findIndex(f => f.id === formId);
    if (formIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    // Update form enabled status
    integration.fbPages[pageIndex].leadForms[formIndex].enabled = enabled;
    await integration.save();

    res.json({
      success: true,
      message: `Form ${enabled ? 'enabled' : 'disabled'} successfully`,
      data: {
        formId,
        enabled: integration.fbPages[pageIndex].leadForms[formIndex].enabled
      }
    });
  } catch (error) {
    logger.error('Error toggling form status:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle form status'
    });
  }
});

// Manually process form leads
router.post('/:id/pages/:pageId/forms/:formId/process-leads', async (req, res) => {
  try {
    const { id: integrationId, pageId, formId } = req.params;
    const { organizationId } = req.user;
    const options = req.body;

    const integration = await FacebookIntegration.findOne({
      _id: integrationId,
      organizationId
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const result = await facebookLeadProcessor.processFormLeads(integration, pageId, formId, options);

    res.json({
      success: true,
      data: result,
      message: 'Form leads processed successfully'
    });
  } catch (error) {
    logger.error('Error processing form leads:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to process form leads'
    });
  }
});

// Get form statistics
router.get('/:id/pages/:pageId/forms/:formId/stats', async (req, res) => {
  try {
    const { id: integrationId, pageId, formId } = req.params;
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({
      _id: integrationId,
      organizationId
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    // Find the page and form
    const page = integration.fbPages.find(p => p.id === pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        message: 'Page not found'
      });
    }

    const form = page.leadForms.find(f => f.id === formId);
    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    res.json({
      success: true,
      data: {
        formId: form.id,
        formName: form.name,
        enabled: form.enabled,
        leadsCount: form.leadsCount || 0,
        stats: form.stats || {},
        assignmentSettings: form.assignmentSettings || {}
      }
    });
  } catch (error) {
    logger.error('Error fetching form statistics:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch form statistics'
    });
  }
});

// Update form assignment settings
router.put('/:id/pages/:pageId/forms/:formId/assignment', async (req, res) => {
  try {
    const { id: integrationId, pageId, formId } = req.params;
    const { organizationId } = req.user;
    const assignmentSettings = req.body;

    const integration = await FacebookIntegration.findOne({
      _id: integrationId,
      organizationId
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    // Find the page and form
    const pageIndex = integration.fbPages.findIndex(p => p.id === pageId);
    if (pageIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Page not found'
      });
    }

    const formIndex = integration.fbPages[pageIndex].leadForms.findIndex(f => f.id === formId);
    if (formIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    // Update form assignment settings
    integration.fbPages[pageIndex].leadForms[formIndex].assignmentSettings = {
      ...integration.fbPages[pageIndex].leadForms[formIndex].assignmentSettings,
      ...assignmentSettings
    };

    await integration.save();

    res.json({
      success: true,
      message: 'Form assignment settings updated',
      data: integration.fbPages[pageIndex].leadForms[formIndex].assignmentSettings
    });
  } catch (error) {
    logger.error('Error updating form assignment settings:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update form assignment settings'
    });
  }
});

// Get form assignment settings
router.get('/:id/pages/:pageId/forms/:formId/assignment', async (req, res) => {
  try {
    const { id: integrationId, pageId, formId } = req.params;
    const { organizationId } = req.user;

    const integration = await FacebookIntegration.findOne({
      _id: integrationId,
      organizationId
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    // Find the page and form
    const page = integration.fbPages.find(p => p.id === pageId);
    if (!page) {
      return res.status(404).json({
        success: false,
        message: 'Page not found'
      });
    }

    const form = page.leadForms.find(f => f.id === formId);
    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    res.json({
      success: true,
      data: form.assignmentSettings
    });
  } catch (error) {
    logger.error('Error getting form assignment settings:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to get form assignment settings'
    });
  }
});

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