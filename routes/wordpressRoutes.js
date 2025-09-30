const express = require('express');
const router = express.Router();
const wordpressService = require('../services/wordpressService');
const WordPressIntegration = require('../models/WordPressIntegration');
const { authenticateUser } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

// WordPress webhook endpoint (NO AUTH REQUIRED)
router.post('/webhook/:integrationKey', async (req, res) => {
  try {
    const { integrationKey } = req.params;
    const formData = req.body;
    
    // Extract metadata from headers and body
    const metadata = {
      formId: req.headers['x-wp-form-id'] || formData._wpcf7 || formData.form_id || 'unknown',
      formName: req.headers['x-wp-form-name'] || formData.form_name || 'Contact Form',
      formPlugin: req.headers['x-wp-form-plugin'] || formData.form_plugin || 'contact-form-7',
      pageUrl: req.headers['x-wp-page-url'] || formData.page_url || '',
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent'],
      referrer: req.headers.referer || req.headers.referrer,
      submissionId: formData.submission_id || `${Date.now()}`
    };

    logger.info('WordPress webhook received:', {
      integrationKey,
      formData: Object.keys(formData),
      metadata
    });

    // Process the form submission
    const result = await wordpressService.processFormSubmission(integrationKey, formData, metadata);

    res.json({
      success: true,
      message: 'Form submission processed successfully',
      leadId: result.leadId
    });

  } catch (error) {
    logger.error('WordPress webhook error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process form submission',
      error: error.message
    });
  }
});

// Test webhook endpoint (NO AUTH REQUIRED)
router.post('/webhook/:integrationKey/test', async (req, res) => {
  try {
    const { integrationKey } = req.params;
    const testData = req.body || {};

    const result = await wordpressService.testWebhook(integrationKey, testData);

    res.json(result);
  } catch (error) {
    logger.error('WordPress webhook test error:', error);
    res.status(500).json({
      success: false,
      message: 'Webhook test failed',
      error: error.message
    });
  }
});

// Plugin download endpoint (NO AUTH REQUIRED)
router.get('/plugin/download', async (req, res) => {
  try {
    const pluginPath = path.join(__dirname, '../wordpress-plugin/jesty-crm-plugin.zip');
    
    if (!fs.existsSync(pluginPath)) {
      return res.status(404).json({
        success: false,
        message: 'Plugin file not found. Please generate the plugin first.'
      });
    }

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="jesty-crm-plugin.zip"');
    
    const fileStream = fs.createReadStream(pluginPath);
    fileStream.pipe(res);

  } catch (error) {
    logger.error('Plugin download error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download plugin',
      error: error.message
    });
  }
});

// Apply authentication to all other routes
router.use(authenticateUser);

// Create WordPress integration
router.post('/create', async (req, res) => {
  try {
    const { id: userId, organizationId } = req.user;
    const { siteUrl, siteName } = req.body;

    if (!siteUrl) {
      return res.status(400).json({
        success: false,
        message: 'Site URL is required'
      });
    }

    // Validate URL format
    let cleanUrl = siteUrl.trim();
    if (!cleanUrl.startsWith('http')) {
      cleanUrl = `https://${cleanUrl}`;
    }

    const integration = await wordpressService.createIntegration(
      organizationId,
      userId,
      cleanUrl,
      siteName
    );

    const pluginInfo = wordpressService.generatePluginInfo(integration);

    res.status(201).json({
      success: true,
      message: 'WordPress integration created successfully',
      data: {
        integration: {
          id: integration._id,
          integrationKey: integration.integrationKey,
          siteUrl: integration.siteUrl,
          siteName: integration.siteName,
          webhookUrl: integration.webhookEndpoint,
          isActive: integration.isActive,
          createdAt: integration.createdAt
        },
        plugin: pluginInfo
      }
    });

  } catch (error) {
    logger.error('Error creating WordPress integration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create WordPress integration',
      error: error.message
    });
  }
});

// Get integrations for organization
router.get('/', async (req, res) => {
  try {
    const { organizationId } = req.user;

    const integrations = await wordpressService.getIntegrationsByOrganization(organizationId);

    res.json({
      success: true,
      data: integrations.map(integration => ({
        id: integration._id,
        siteUrl: integration.siteUrl,
        siteName: integration.siteName,
        integrationKey: integration.integrationKey,
        webhookUrl: integration.webhookEndpoint,
        isActive: integration.isActive,
        connected: integration.connected,
        pluginStatus: integration.pluginStatus,
        formsCount: integration.forms.length,
        statistics: integration.statistics,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt
      }))
    });

  } catch (error) {
    logger.error('Error fetching WordPress integrations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integrations',
      error: error.message
    });
  }
});

// Get specific integration
router.get('/:id', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await WordPressIntegration.findOne({
      _id: id,
      organizationId
    }).select('-apiKey -webhookSecret');

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const pluginInfo = wordpressService.generatePluginInfo(integration);

    res.json({
      success: true,
      data: {
        integration,
        plugin: pluginInfo
      }
    });

  } catch (error) {
    logger.error('Error fetching WordPress integration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch integration',
      error: error.message
    });
  }
});

// Update integration settings
router.put('/:id', validateRequest([
  'leadMappingConfig',
  'assignmentSettings',
  'autoMapping'
]), async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const updateData = req.body;

    // Ensure user can only update their organization's integrations
    const integration = await WordPressIntegration.findOne({
      _id: id,
      organizationId
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const updatedIntegration = await wordpressService.updateIntegration(id, updateData);

    res.json({
      success: true,
      message: 'Integration updated successfully',
      data: updatedIntegration
    });

  } catch (error) {
    logger.error('Error updating WordPress integration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update integration',
      error: error.message
    });
  }
});

// Delete integration
router.delete('/:id', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await WordPressIntegration.findOneAndUpdate(
      { _id: id, organizationId },
      { isActive: false, deletedAt: new Date() },
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
    logger.error('Error deleting WordPress integration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete integration',
      error: error.message
    });
  }
});

// Test integration connection
router.post('/:id/test', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const testData = req.body;

    const integration = await WordPressIntegration.findOne({
      _id: id,
      organizationId
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const result = await wordpressService.testWebhook(integration.integrationKey, testData);

    res.json(result);

  } catch (error) {
    logger.error('Error testing WordPress integration:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test integration',
      error: error.message
    });
  }
});

// Get integration forms
router.get('/:id/forms', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;

    const integration = await WordPressIntegration.findOne({
      _id: id,
      organizationId
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    res.json({
      success: true,
      data: integration.forms
    });

  } catch (error) {
    logger.error('Error fetching integration forms:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch forms',
      error: error.message
    });
  }
});

// Update form mapping
router.put('/:id/forms/:formId/mapping', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id, formId } = req.params;
    const { fieldMapping } = req.body;

    const integration = await WordPressIntegration.findOne({
      _id: id,
      organizationId
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        message: 'Integration not found'
      });
    }

    const form = integration.forms.find(f => f.formId === formId);
    if (!form) {
      return res.status(404).json({
        success: false,
        message: 'Form not found'
      });
    }

    form.fieldMapping = fieldMapping;
    await integration.save();

    res.json({
      success: true,
      message: 'Form mapping updated successfully',
      data: form
    });

  } catch (error) {
    logger.error('Error updating form mapping:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update form mapping',
      error: error.message
    });
  }
});

// Get integration statistics
router.get('/:id/stats', async (req, res) => {
  try {
    const { organizationId } = req.user;
    const { id } = req.params;
    const { period = '30d' } = req.query;

    const integration = await WordPressIntegration.findOne({
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
      summary: integration.statistics,
      period: period,
      startDate: startDate,
      endDate: new Date(),
      forms: integration.forms.map(form => ({
        formId: form.formId,
        formName: form.formName,
        formPlugin: form.formPlugin,
        totalSubmissions: form.totalSubmissions,
        lastSubmission: form.lastSubmission,
        isEnabled: form.isEnabled
      }))
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    logger.error('Error fetching integration stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch statistics',
      error: error.message
    });
  }
});

module.exports = router;