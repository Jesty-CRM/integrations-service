const express = require('express');
const router = express.Router();
const facebookService = require('../services/facebook.service');
const linkedinService = require('../services/linkedin.service');
const shopifyService = require('../services/shopifyService');
const logger = require('../utils/logger');

/**
 * @route   GET /api/webhooks/status
 * @desc    Get webhook status
 * @access  Public
 */
router.get('/status', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Webhook service is running',
    configuration: {
      webhook_url: `${process.env.API_URL}/api/webhooks/facebook`,
      verify_token: process.env.FB_VERIFY_TOKEN,
      app_id: process.env.FB_APP_ID
    },
    endpoints: {
      facebook: {
        verification: 'GET /api/webhooks/facebook',
        webhook: 'POST /api/webhooks/facebook'
      }
    },
    instructions: {
      step1: 'Go to https://developers.facebook.com/apps/' + process.env.FB_APP_ID + '/webhooks/',
      step2: 'Set Callback URL to: ' + process.env.API_URL + '/api/webhooks/facebook',
      step3: 'Set Verify Token to: ' + process.env.FB_VERIFY_TOKEN,
      step4: 'Subscribe to "leadgen" events',
      step5: 'Subscribe your page to the webhook'
    }
  });
});

/**
 * @route   POST /api/webhooks/facebook/setup
 * @desc    Setup Facebook webhook subscription
 * @access  Public
 */
router.post('/facebook/setup', async (req, res) => {
  try {
    const { integrationId } = req.body;
    
    if (!integrationId) {
      return res.status(400).json({
        success: false,
        message: 'Integration ID is required'
      });
    }

    // Find integration using FacebookIntegration model
    const FacebookIntegration = require('../models/FacebookIntegration');
    const integration = await FacebookIntegration.findById(integrationId);
    
    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Facebook integration not found'
      });
    }

    // Log integration details for debugging
    console.log('Integration found:', {
      id: integration._id,
      fbPages: integration.fbPages?.length,
      connected: integration.connected
    });

    // Setup webhook for each Facebook page
    const webhookUrl = `${process.env.API_URL}/api/webhooks/facebook`;
    const results = [];
    
    for (const page of integration.fbPages || []) {
      const credentials = {
        accessToken: page.accessToken,
        pageId: page.id
      };
      
      const result = await facebookService.setupWebhook(credentials, webhookUrl);
      results.push({
        pageId: page.id,
        pageName: page.name,
        result: result
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Facebook webhook setup completed',
      webhookUrl: webhookUrl,
      results: results
    });

  } catch (error) {
    logger.error('Facebook webhook setup error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/webhooks/facebook
 * @desc    Facebook webhook verification
 * @access  Public
 */
router.get('/facebook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  
  if (mode === 'subscribe' && token === process.env.FB_VERIFY_TOKEN) {
    logger.info('Facebook webhook verified');
    res.status(200).send(challenge);
  } else {
    logger.warn('Facebook webhook verification failed');
    res.status(403).send('Verification failed');
  }
});

/**
 * @route   POST /api/webhooks/facebook
 * @desc    Handle Facebook webhook events
 * @access  Public
 */
router.post('/facebook', async (req, res) => {
  try {
    logger.info('Facebook webhook received:', JSON.stringify(req.body, null, 2));
    await facebookService.handleWebhook(req.body);
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Facebook webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * @route   POST /api/webhooks/linkedin
 * @desc    Handle LinkedIn webhook events
 * @access  Public
 */
router.post('/linkedin', async (req, res) => {
  try {
    await linkedinService.handleWebhook(req.body);
    res.status(200).send('OK');
  } catch (error) {
    logger.error('LinkedIn webhook error:', error);
    res.status(500).send('Error');
  }
});

/**
 * @route   POST /api/webhooks/shopify
 * @desc    Handle generic Shopify webhook events
 * @access  Public
 */
router.post('/shopify', async (req, res) => {
  try {
    const result = await shopifyService.handleWebhook(req.body, req.headers);
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      data: result
    });
  } catch (error) {
    logger.error('Shopify webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      error: error.message
    });
  }
});

/**
 * @route   POST /api/webhooks/shopify/:organizationId
 * @desc    Handle organization-specific Shopify webhook events
 * @access  Public
 */
router.post('/shopify/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    
    // Add organization context to headers for processing
    const enhancedHeaders = {
      ...req.headers,
      'x-organization-id': organizationId
    };
    
    const result = await shopifyService.handleWebhook(req.body, enhancedHeaders);
    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      organizationId: organizationId,
      data: result
    });
  } catch (error) {
    logger.error(`Shopify webhook error for organization ${req.params.organizationId}:`, error);
    res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
      organizationId: req.params.organizationId,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/webhooks/website-lead
 * @desc    Handle website form submissions from integrated websites
 * @access  Public (no authentication required)
 */
router.post('/website-lead', async (req, res) => {
  try {
    const websiteService = require('../services/website.service');
    const result = await websiteService.handleWebsiteLead(req.body, req.headers);
    
    if (result.success) {
      res.status(201).json({
        success: true,
        leadId: result.leadId,
        message: 'Lead received successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message || 'Failed to process lead'
      });
    }
  } catch (error) {
    logger.error('Website lead webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

/**
 * @route   POST /api/webhooks/website/:integrationKey
 * @desc    Handle website form submissions with integration key in URL
 * @access  Public (no authentication required)
 */
router.post('/website/:integrationKey', async (req, res) => {
  try {
    const websiteService = require('../services/website.service');
    const { integrationKey } = req.params;
    
    // Add integration key to headers for processing
    const enhancedHeaders = {
      ...req.headers,
      'x-integration-key': integrationKey
    };
    
    const result = await websiteService.handleWebsiteLead(req.body, enhancedHeaders);
    
    if (result.success) {
      res.status(201).json({
        success: true,
        leadId: result.leadId,
        message: 'Lead received successfully'
      });
    } else {
      res.status(400).json({
        success: false,
        message: result.message || 'Failed to process lead'
      });
    }
  } catch (error) {
    logger.error('Website webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
});

module.exports = router;
