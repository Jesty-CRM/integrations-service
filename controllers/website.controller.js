const express = require('express');
const router = express.Router();
const websiteService = require('../services/website.service');
const WebsiteIntegration = require('../models/WebsiteIntegration');
const { authenticateUser, authenticateService } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const { rateLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

// Get website integrations for organization
router.get('/', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    
    const integrations = await WebsiteIntegration.find({
      organizationId,
      $or: [
        { isDeleted: false },
        { isDeleted: { $exists: false } }
      ]
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      integrations
    });
  } catch (error) {
    logger.error('Error fetching website integrations:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integrations'
    });
  }
});

// Get specific website integration
router.get('/:id', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await WebsiteIntegration.findOne({
      _id: id,
      organizationId,
      $or: [
        { isDeleted: false },
        { isDeleted: { $exists: false } }
      ]
    });

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
    logger.error('Error fetching website integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integration'
    });
  }
});

// Create new website integration
router.post('/', authenticateUser, validateRequest([
  'name',
  'domain'
]), async (req, res) => {
  try {
    console.log('🔧 Debug - req.user object:', req.user);
    
    const { id: userId, organizationId } = req.user;
    
    console.log('🔧 Debug - Creating integration with data:', {
      userId,
      organizationId,
      body: req.body
    });
    
    // Use the service method to create integration
    const integration = await websiteService.createIntegration(userId, organizationId, req.body);

    res.status(201).json({
      success: true,
      integration,
      message: 'Website integration created successfully'
    });
  } catch (error) {
    console.error('❌ Creation error:', error.message);
    console.error('❌ Error stack:', error.stack);
    logger.error('Error creating website integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to create integration',
      error: error.message
    });
  }
});

// Update website integration
router.put('/:id', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const updates = req.body;

    const integration = await WebsiteIntegration.findOneAndUpdate(
      { _id: id, organizationId },
      {
        ...updates,
        updatedAt: new Date()
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
      integration
    });
  } catch (error) {
    console.error('❌ Update error:', error);
    console.error('❌ Update error message:', error.message);
    console.error('❌ Update error stack:', error.stack);
    logger.error('Error updating website integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to update integration',
      error: error.message
    });
  }
});

// Get embed code for integration
router.get('/:id/embed', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await WebsiteIntegration.findOne({
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

    const embedCode = websiteService.generateEmbedCode(integration);

    res.json({
      success: true,
      embedCode,
      instructions: `
        1. Copy the embed code below
        2. Paste it into your website's HTML
        3. The form will automatically appear where you place the code
        4. Test the form to ensure it's working properly
      `
    });
  } catch (error) {
    logger.error('Error generating embed code:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to generate embed code'
    });
  }
});

// Process website form submission (public endpoint)
router.post('/submit/:id', rateLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const formData = req.body;
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    const referer = req.get('Referer');

    // Find integration
    const integration = await WebsiteIntegration.findOne({
      _id: id,
      isActive: true,
      isDeleted: false
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    // Validate domain if configured
    if (integration.security.domainWhitelist.length > 0) {
      const isValidDomain = websiteService.validateDomain(referer, integration.security.domainWhitelist);
      if (!isValidDomain) {
        return res.status(403).json({
          success: false,
          message: 'Domain not authorized'
        });
      }
    }

    // Verify reCAPTCHA if enabled
    if (integration.security.enableRecaptcha && formData.recaptchaToken) {
      const isValidRecaptcha = await websiteService.verifyRecaptcha(
        formData.recaptchaToken,
        integration.security.recaptchaSecret
      );
      
      if (!isValidRecaptcha) {
        return res.status(400).json({
          success: false,
          message: 'reCAPTCHA verification failed'
        });
      }
    }

    // Process the lead
    const adminToken = req.headers.authorization?.replace('Bearer ', '') || null;
    const result = await websiteService.processWebsiteLead(integration, {
      ...formData,
      metadata: {
        clientIP,
        userAgent,
        referer,
        timestamp: new Date()
      }
    }, adminToken);

    // Update integration stats
    await WebsiteIntegration.updateOne(
      { _id: integration._id },
      { 
        $inc: { 'stats.totalSubmissions': 1 },
        'stats.lastSubmission': new Date()
      }
    );

    res.json({
      success: true,
      message: integration.formConfig.successMessage || 'Thank you for your submission!',
      leadId: result.leadId
    });

  } catch (error) {
    logger.error('Error processing website form submission:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to process form submission'
    });
  }
});

// Verify integration (check if form is accessible)
router.get('/:id/verify', async (req, res) => {
  try {
    const { id } = req.params;
    const { domain } = req.query;

    const integration = await WebsiteIntegration.findOne({
      _id: id,
      isActive: true,
      isDeleted: false
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    // Check domain if provided
    let domainValid = true;
    if (domain && integration.security.domainWhitelist.length > 0) {
      domainValid = integration.security.domainWhitelist.some(
        allowedDomain => domain.includes(allowedDomain)
      );
    }

    res.json({
      success: true,
      integration: {
        id: integration._id,
        name: integration.name,
        formConfig: integration.formConfig,
        appearance: integration.appearance,
        isActive: integration.isActive
      },
      domainValid,
      message: 'Integration verified'
    });

  } catch (error) {
    logger.error('Error verifying website integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to verify integration'
    });
  }
});

// Test integration
router.post('/:id/test', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const testData = req.body;

    const integration = await WebsiteIntegration.findOne({
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

    // Process test submission
    const result = await websiteService.processWebsiteLead(integration, {
      ...testData,
      isTest: true,
      metadata: {
        source: 'test-submission',
        timestamp: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Test submission processed successfully',
      result
    });

  } catch (error) {
    logger.error('Error testing website integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to test integration'
    });
  }
});

// Get integration analytics
router.get('/:id/analytics', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { period = '30d' } = req.query;

    const integration = await WebsiteIntegration.findOne({
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

    const analytics = {
      summary: integration.stats,
      period: period,
      startDate: startDate,
      endDate: new Date(),
      integrationAge: Math.floor((new Date() - integration.createdAt) / (1000 * 60 * 60 * 24)) + ' days'
    };

    res.json({
      success: true,
      analytics
    });

  } catch (error) {
    logger.error('Error fetching website integration analytics:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics'
    });
  }
});

// Delete integration
router.delete('/:id', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await WebsiteIntegration.findOneAndUpdate(
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
    logger.error('Error deleting website integration:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to delete integration'
    });
  }
});

// Regenerate API key
router.post('/:id/regenerate-key', authenticateUser, async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await WebsiteIntegration.findOne({
      _id: id,
      organizationId
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    // Generate new API key
    integration.apiKey = websiteService.generateAPIKey();
    integration.updatedAt = new Date();
    
    // Regenerate embed code with new API key
    integration.embedCode = websiteService.generateEmbedCode(integration);
    
    await integration.save();

    res.json({
      success: true,
      message: 'API key regenerated successfully',
      apiKey: integration.apiKey
    });

  } catch (error) {
    logger.error('Error regenerating API key:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to regenerate API key'
    });
  }
});

module.exports = router;
