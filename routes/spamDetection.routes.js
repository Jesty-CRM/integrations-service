const express = require('express');
const router = express.Router();
const facebookSpamDetection = require('../utils/facebookSpamDetection');
const logger = require('../utils/logger');

/**
 * Get Facebook spam detection statistics
 */
router.get('/facebook/stats', (req, res) => {
  try {
    const stats = facebookSpamDetection.getStats();
    
    res.json({
      success: true,
      data: {
        ...stats,
        timestamp: new Date(),
        service: 'integrations-service'
      }
    });
  } catch (error) {
    logger.error('Error getting Facebook spam stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get spam detection statistics',
      error: error.message
    });
  }
});

/**
 * Test Facebook spam detection
 */
router.post('/facebook/test', (req, res) => {
  try {
    const { name, email, phone, leadgenId, formName } = req.body;

    if (!name || (!email && !phone)) {
      return res.status(400).json({
        success: false,
        message: 'Name and at least one contact method (email or phone) are required for testing'
      });
    }

    const testData = {
      name,
      email,
      phone,
      leadgenId: leadgenId || 'test_123456',
      formName: formName || 'Test Form',
      extractedFields: {
        name,
        email,
        phone,
        customFields: req.body.customFields || {}
      }
    };

    const spamResult = facebookSpamDetection.detectFacebookSpam(testData);

    res.json({
      success: true,
      data: {
        isSpam: spamResult.isSpam,
        spamScore: spamResult.spamScore,
        spamIndicators: spamResult.spamIndicators,
        action: spamResult.action,
        reason: spamResult.reason,
        testData: {
          name,
          email,
          phone,
          leadgenId,
          formName
        }
      }
    });

  } catch (error) {
    logger.error('Error testing Facebook spam detection:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test spam detection',
      error: error.message
    });
  }
});

/**
 * Add custom spam pattern
 */
router.post('/facebook/patterns/add', (req, res) => {
  try {
    const { pattern, type } = req.body;
    
    if (!pattern || !type) {
      return res.status(400).json({
        success: false,
        message: 'Pattern and type are required'
      });
    }

    const validTypes = ['email', 'phone', 'name', 'leadgenId', 'formName'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: `Invalid pattern type. Must be one of: ${validTypes.join(', ')}`
      });
    }

    const success = facebookSpamDetection.addSpamPattern(type, pattern);
    
    if (success) {
      logger.info('Facebook spam pattern added:', {
        pattern,
        type,
        addedAt: new Date(),
        service: 'integrations-service'
      });
      
      res.json({
        success: true,
        message: `Facebook spam ${type} pattern added successfully`,
        data: { pattern, type }
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to add spam pattern'
      });
    }

  } catch (error) {
    logger.error('Error adding Facebook spam pattern:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add spam pattern',
      error: error.message
    });
  }
});

module.exports = router;