const express = require('express');
const router = express.Router();
const facebookService = require('../services/facebook.service');
const linkedinService = require('../services/linkedin.service');
const shopifyService = require('../services/shopify.service');
const logger = require('../utils/logger');

/**
 * @route   GET /api/webhooks/facebook
 * @desc    Facebook webhook verification
 * @access  Public
 */
router.get('/facebook', (req, res) => {
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  
  if (mode === 'subscribe' && token === process.env.FACEBOOK_VERIFY_TOKEN) {
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
    await facebookService.handleWebhook(req.body);
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Facebook webhook error:', error);
    res.status(500).send('Error');
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
 * @desc    Handle Shopify webhook events
 * @access  Public
 */
router.post('/shopify', async (req, res) => {
  try {
    await shopifyService.handleWebhook(req.body, req.headers);
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Shopify webhook error:', error);
    res.status(500).send('Error');
  }
});

module.exports = router;
