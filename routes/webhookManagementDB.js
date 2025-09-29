const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const shopifyService = require('../services/shopifyService');
const ShopifyIntegration = require('../models/ShopifyIntegration');
const logger = require('../utils/logger');
const crypto = require('crypto');

/**
 * @route POST /api/webhooks/create/:organizationId
 * @desc Create webhook configuration for an organization
 * @access Public
 */
router.post('/create/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { 
      name, 
      leadDistribution = { type: 'auto' },
      leadSettings = {},
      userId // This should be the actual user ID who's creating the integration
    } = req.body;

    const baseUrl = process.env.INTEGRATIONS_SERVICE_URL || `${req.protocol}://${req.get('host')}`;
    
    // Check if integration already exists - try both string and ObjectId matching
    const existingIntegration = await ShopifyIntegration.findOne({ 
      $or: [
        { organizationId: organizationId },
        { organizationId: new mongoose.Types.ObjectId(organizationId) }
      ],
      isDeleted: { $ne: true }
    });

    if (existingIntegration) {
      return res.status(200).json({
        success: true,
        message: 'Webhook integration already exists for this organization',
        data: {
          id: existingIntegration._id.toString(),
          organizationId: existingIntegration.organizationId.toString(),
          name: name || existingIntegration.customConfig?.name || `Shopify Webhook - ${organizationId}`,
          webhookUrl: existingIntegration.webhookEndpoint,
          status: existingIntegration.isActive ? 'active' : 'inactive',
          existingWebhookUrl: existingIntegration.webhookEndpoint,
          createdAt: existingIntegration.createdAt.toISOString()
        }
      });
    }

    // Validate required fields
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required - must be the ID of the user creating this integration',
        example: {
          userId: "68cdc7142f6d35330de60ea0",
          name: "My Store Webhook",
          leadDistribution: { type: "specific", assignedUsers: ["68cdc7142f6d35330de60ea0"] }
        }
      });
    }

    // Create webhook secret
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const webhookUrl = `${baseUrl}/api/webhooks/shopify/${organizationId}`;

    // Create new integration in database
    const shopifyIntegration = new ShopifyIntegration({
      organizationId,
      userId, // This should be the actual user ID, not organization ID
      webhookEndpoint: webhookUrl,
      webhookSecret,
      
      // NO predefined webhook events - let Shopify send ANY event
      webhookEvents: [], // Empty array - will be populated automatically as events come in

      // Lead mapping configuration
      leadMappingConfig: {
        mapOrdersAsLeads: true,
        mapCustomersAsLeads: true,
        leadSource: 'Shopify',
        leadStatus: leadSettings.defaultStatus || 'new'
      },

      // Assignment settings based on lead distribution
      assignmentSettings: {
        enabled: leadDistribution.type !== 'auto',
        mode: leadDistribution.type,
        
        // For specific assignment - assign to one user
        assignToUser: leadDistribution.type === 'specific' && leadDistribution.assignedUsers?.length > 0 
          ? leadDistribution.assignedUsers[0] 
          : userId,
        
        // For multi-user assignments
        assignToUsers: leadDistribution.assignedUsers?.map(userId => ({ 
          userId: userId, 
          weight: 1 
        })) || [],
        
        algorithm: leadDistribution.algorithm || 'weighted-round-robin',
        
        rules: leadDistribution.autoAssignmentRules || {
          highValueThreshold: 500,
          newCustomerPriority: 'medium',
          returningCustomerPriority: 'high',
          abandonedCartPriority: 'high'
        }
      },

      // Metadata
      isInstalled: true,
      isActive: true,
      installedAt: new Date(),
      
      // Custom configuration for our universal handler
      customConfig: {
        name: name || `Shopify Webhook - ${organizationId}`,
        leadDistribution,
        leadSettings: {
          defaultStatus: leadSettings.defaultStatus || 'new',
          defaultPriority: leadSettings.defaultPriority || 'medium',
          autoScoring: leadSettings.autoScoring !== false,
          createDuplicates: leadSettings.createDuplicates || false,
          tagPrefix: leadSettings.tagPrefix || 'shopify',
          customFields: leadSettings.customFields || {}
        }
      }
    });

    // Save to database
    const savedIntegration = await shopifyIntegration.save();

    logger.info(`Webhook configuration saved to database for organization: ${organizationId}`, {
      integrationId: savedIntegration._id,
      leadDistribution: leadDistribution.type,
      assignedUsers: leadDistribution.assignedUsers?.length || 0
    });

    // Return response with database data
    const response = {
      id: savedIntegration._id.toString(),
      organizationId: savedIntegration.organizationId.toString(),
      name: name || `Shopify Webhook - ${organizationId}`,
      webhookUrl: savedIntegration.webhookEndpoint,
      genericWebhookUrl: `${baseUrl}/api/webhooks/shopify`,
      status: 'active',
      eventHandling: 'automatic',
      description: 'Automatically handles all Shopify webhook events and creates leads based on event type',
      
      leadDistribution: {
        type: leadDistribution.type,
        assignedUsers: leadDistribution.assignedUsers || [],
        autoAssignmentRules: leadDistribution.autoAssignmentRules || {
          highValueThreshold: 500,
          newCustomerPriority: 'medium',
          returningCustomerPriority: 'high',
          abandonedCartPriority: 'high'
        }
      },

      leadSettings: {
        defaultStatus: leadSettings.defaultStatus || 'new',
        defaultPriority: leadSettings.defaultPriority || 'medium',
        autoScoring: leadSettings.autoScoring !== false,
        createDuplicates: leadSettings.createDuplicates || false,
        tagPrefix: leadSettings.tagPrefix || 'shopify',
        customFields: leadSettings.customFields || {}
      },

      automaticEventTypes: [
        'orders/create', 'orders/paid', 'orders/updated', 'orders/cancelled',
        'customers/create', 'customers/update', 'customers/delete',
        'checkouts/create', 'checkouts/update',
        'carts/create', 'carts/update',
        'products/create', 'products/update',
        'app/uninstalled'
      ],

      shopifySetupInstructions: [
        '1. Go to your Shopify Admin → Settings → Notifications',
        '2. Scroll to "Webhooks" section and click "Create webhook"',
        '3. Select ANY event type you want to track',
        `4. Paste this webhook URL: ${savedIntegration.webhookEndpoint}`,
        '5. Set Format to "JSON"',
        '6. Set API version to "Latest"',
        '7. Save webhook',
        '8. The system will automatically handle ALL event types!'
      ],

      endpoints: {
        webhook: savedIntegration.webhookEndpoint,
        test: `${baseUrl}/api/shopify/test-webhook/${organizationId}`,
        update: `${baseUrl}/api/webhooks/update/${organizationId}`
      },

      statistics: {
        totalWebhooksReceived: savedIntegration.statistics?.totalWebhooksReceived || 0,
        totalLeadsCreated: savedIntegration.statistics?.totalLeadsCreated || 0,
        totalRevenue: savedIntegration.statistics?.totalRevenue || 0
      },

      createdAt: savedIntegration.createdAt.toISOString(),
      createdBy: 'system'
    };

    res.status(201).json({
      success: true,
      message: 'Webhook configuration created and saved to database successfully',
      data: response
    });

  } catch (error) {
    logger.error('Error creating webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create webhook configuration',
      details: error.message
    });
  }
});

/**
 * @route PUT /api/webhooks/update/:organizationId
 * @desc Update webhook lead distribution and settings
 * @access Public
 */
router.put('/update/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const { 
      name,
      leadDistribution,
      leadSettings,
      userId // Add userId parameter for proper user tracking
    } = req.body;

    // Find existing integration - try both string and ObjectId matching
    const integration = await ShopifyIntegration.findOne({ 
      $or: [
        { organizationId: organizationId },
        { organizationId: new mongoose.Types.ObjectId(organizationId) }
      ],
      isDeleted: { $ne: true }
    });

    if (!integration) {
      logger.warn(`No webhook integration found for organization: ${organizationId}`);
      return res.status(404).json({
        success: false,
        error: 'Webhook integration not found for this organization',
        suggestion: `Use POST http://localhost:3005/api/webhooks/create/${organizationId} to create one first`
      });
    }

    logger.info(`Found integration for update: ${integration._id} (org: ${integration.organizationId})`);

    // Update the integration
    if (name) {
      integration.customConfig = integration.customConfig || {};
      integration.customConfig.name = name;
    }

    // Update userId if provided (should be the actual user, not organization)
    if (userId && userId !== organizationId) {
      integration.userId = userId;
      logger.info(`Updated userId to: ${userId} (was: ${integration.userId})`);
    }

    if (leadDistribution) {
      integration.customConfig = integration.customConfig || {};
      integration.customConfig.leadDistribution = leadDistribution;
      
      // Update assignment settings
      integration.assignmentSettings = {
        enabled: leadDistribution.type !== 'auto',
        mode: leadDistribution.type,
        
        // Set specific user assignment
        assignToUser: leadDistribution.type === 'specific' && leadDistribution.assignedUsers?.length > 0 
          ? leadDistribution.assignedUsers[0] 
          : integration.assignmentSettings?.assignToUser,
        
        // Set multi-user assignments
        assignToUsers: leadDistribution.assignedUsers?.map(userId => ({ 
          userId: userId, 
          weight: 1 
        })) || integration.assignmentSettings?.assignToUsers || [],
        
        algorithm: leadDistribution.algorithm || integration.assignmentSettings?.algorithm || 'weighted-round-robin',
        rules: leadDistribution.autoAssignmentRules || integration.assignmentSettings?.rules || {
          highValueThreshold: 500,
          newCustomerPriority: 'medium',
          returningCustomerPriority: 'high',
          abandonedCartPriority: 'high'
        }
      };
    }

    if (leadSettings) {
      integration.customConfig = integration.customConfig || {};
      integration.customConfig.leadSettings = leadSettings;
      
      // Update lead mapping config
      integration.leadMappingConfig = integration.leadMappingConfig || {};
      integration.leadMappingConfig.leadStatus = leadSettings.defaultStatus || integration.leadMappingConfig.leadStatus;
    }

    // Update timestamps
    integration.updatedAt = new Date();

    // Save updated integration
    const updatedIntegration = await integration.save();

    logger.info(`Webhook updated successfully for organization: ${organizationId}`, {
      integrationId: updatedIntegration._id,
      leadDistributionType: leadDistribution?.type,
      assignedUsers: leadDistribution?.assignedUsers?.length || 0,
      userId: updatedIntegration.userId
    });

    const baseUrl = process.env.INTEGRATIONS_SERVICE_URL || `${req.protocol}://${req.get('host')}`;

    const response = {
      id: updatedIntegration._id.toString(),
      organizationId: updatedIntegration.organizationId.toString(),
      userId: updatedIntegration.userId?.toString(),
      name: name || updatedIntegration.customConfig?.name,
      webhookUrl: updatedIntegration.webhookEndpoint,
      status: 'active',
      eventHandling: 'automatic',
      leadDistribution: updatedIntegration.customConfig?.leadDistribution || { type: 'auto' },
      leadSettings: updatedIntegration.customConfig?.leadSettings || {},
      updatedAt: updatedIntegration.updatedAt.toISOString()
    };

    res.json({
      success: true,
      message: 'Webhook configuration updated successfully',
      data: response
    });

  } catch (error) {
    logger.error('Error updating webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update webhook configuration',
      details: error.message
    });
  }
});

/**
 * @route GET /api/webhooks/get/:organizationId
 * @desc Get webhook configuration for an organization
 * @access Public
 */
router.get('/get/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;
    const baseUrl = process.env.INTEGRATIONS_SERVICE_URL || `${req.protocol}://${req.get('host')}`;

    // Find integration in database - try both string and ObjectId matching
    const integration = await ShopifyIntegration.findOne({ 
      $or: [
        { organizationId: organizationId },
        { organizationId: new mongoose.Types.ObjectId(organizationId) }
      ],
      isDeleted: { $ne: true }
    });

    if (!integration) {
      logger.warn(`No webhook integration found for organization: ${organizationId}`);
      return res.status(404).json({
        success: false,
        error: 'Webhook integration not found for this organization',
        suggestion: `Use POST ${baseUrl}/api/webhooks/create/${organizationId} to create one`,
        organizationId: organizationId
      });
    }

    logger.info(`Webhook config found for organization: ${organizationId}`, {
      integrationId: integration._id,
      isActive: integration.isActive
    });

    const webhookConfig = {
      id: integration._id.toString(),
      organizationId: integration.organizationId.toString(),
      userId: integration.userId?.toString(),
      name: integration.customConfig?.name || `Shopify Auto-Handler - ${organizationId}`,
      webhookUrl: integration.webhookEndpoint,
      genericWebhookUrl: `${baseUrl}/api/webhooks/shopify`,
      webhookSecret: integration.webhookSecret,
      status: integration.isActive ? 'active' : 'inactive',
      eventHandling: 'automatic',
      description: 'Automatically processes ALL Shopify webhook events',

      // Current Lead Distribution Settings from database
      leadDistribution: integration.customConfig?.leadDistribution || {
        type: integration.assignmentSettings?.mode || 'auto',
        assignedUsers: integration.assignmentSettings?.assignToUsers?.map(u => u.userId) || [],
        autoAssignmentRules: integration.assignmentSettings?.rules || {
          highValueThreshold: 500,
          newCustomerPriority: 'medium',
          returningCustomerPriority: 'high',
          abandonedCartPriority: 'high'
        }
      },

      // Current Lead Settings from database
      leadSettings: integration.customConfig?.leadSettings || {
        defaultStatus: integration.leadMappingConfig?.leadStatus || 'new',
        defaultPriority: 'medium',
        autoScoring: true,
        createDuplicates: false,
        tagPrefix: 'shopify',
        customFields: {}
      },

      // Database webhook events configuration
      enabledEvents: integration.webhookEvents?.filter(e => e.isEnabled)?.map(e => e.event) || [],
      allEvents: integration.webhookEvents || [],

      // All supported Shopify events (auto-handled)
      supportedEvents: [
        'orders/create', 'orders/paid', 'orders/updated', 'orders/cancelled',
        'customers/create', 'customers/update', 'customers/delete',
        'checkouts/create', 'checkouts/update',
        'carts/create', 'carts/update',
        'products/create', 'products/update',
        'app/uninstalled'
      ],

      endpoints: {
        webhook: integration.webhookEndpoint,
        test: `${baseUrl}/api/shopify/test-webhook/${organizationId}`,
        update: `${baseUrl}/api/webhooks/update/${organizationId}`
      },

      shopifyInstructions: {
        title: 'Universal Shopify Webhook Setup',
        description: 'This webhook automatically handles ALL Shopify events',
        steps: [
          'Copy the webhook URL below',
          'Go to Shopify Admin → Settings → Notifications',
          'Scroll to "Webhooks" and click "Create webhook"',
          'Select ANY event type you want to track',
          'Paste the webhook URL and set Format to JSON',
          'Save - the system will auto-handle any event!'
        ],
        webhookUrl: integration.webhookEndpoint,
        note: 'You can set up multiple webhooks for different events - all will be processed automatically'
      },

      statistics: {
        totalWebhooksReceived: integration.statistics?.totalWebhooksReceived || 0,
        totalLeadsCreated: integration.statistics?.totalLeadsCreated || 0,
        totalRevenue: integration.statistics?.totalRevenue || 0,
        eventBreakdown: integration.statistics?.eventBreakdown || {},
        lastWebhookReceived: integration.statistics?.lastWebhookReceived,
        lastLeadCreated: integration.statistics?.lastLeadCreated
      },

      createdAt: integration.createdAt.toISOString(),
      updatedAt: integration.updatedAt.toISOString(),
      retrievedAt: new Date().toISOString()
    };

    logger.info(`Webhook config retrieved from database for organization: ${organizationId}`);

    res.json({
      success: true,
      message: 'Webhook configuration retrieved successfully from database',
      data: webhookConfig
    });

  } catch (error) {
    logger.error('Error retrieving webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve webhook configuration',
      details: error.message
    });
  }
});

/**
 * @route DELETE /api/webhooks/delete/:organizationId
 * @desc Delete webhook configuration for an organization
 * @access Public
 */
router.delete('/delete/:organizationId', async (req, res) => {
  try {
    const { organizationId } = req.params;

    // Find and soft delete the integration
    const integration = await ShopifyIntegration.findOne({ 
      organizationId,
      isDeleted: false 
    });

    if (!integration) {
      return res.status(404).json({
        success: false,
        error: 'Webhook integration not found for this organization'
      });
    }

    // Soft delete
    integration.isDeleted = true;
    integration.isActive = false;
    integration.deletedAt = new Date();
    
    await integration.save();

    logger.info(`Webhook configuration deleted for organization: ${organizationId}`, {
      integrationId: integration._id
    });

    res.json({
      success: true,
      message: 'Webhook configuration deleted successfully',
      data: {
        organizationId: integration.organizationId.toString(),
        status: 'deleted',
        deletedAt: integration.deletedAt.toISOString()
      }
    });

  } catch (error) {
    logger.error('Error deleting webhook:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete webhook configuration',
      details: error.message
    });
  }
});

module.exports = router;