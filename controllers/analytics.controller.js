const FacebookIntegration = require('../models/FacebookIntegration');
const ShopifyIntegration = require('../models/ShopifyIntegration');
const WebsiteIntegration = require('../models/WebsiteIntegration');
const WordPressIntegration = require('../models/WordPressIntegration');
const IntegrationConfig = require('../models/IntegrationConfig');
const { ObjectId } = require('mongoose').Types;

// Helper functions outside the class
async function checkFacebookStatus(organizationId) {
  try {
    // Validate organizationId before querying
    if (!ObjectId.isValid(organizationId)) {
      throw new Error(`Invalid organizationId format: ${organizationId}`);
    }
    
    const integration = await FacebookIntegration.findOne({ organizationId });
    
    if (!integration) {
      return {
        platform: 'Facebook',
        status: 'not_configured',
        lastActivity: null,
        isActive: false
      };
    }

    // Check if access token exists and connected is true
    const isConnected = integration.userAccessToken && 
                       integration.connected === true;

    return {
      platform: 'Facebook',
      status: isConnected ? 'connected' : 'disconnected',
      lastActivity: integration.updatedAt,
      isActive: integration.connected,
      configuredAt: integration.createdAt,
      totalLeads: integration.totalLeads || 0,
      lastLeadReceived: integration.lastLeadReceived
    };
  } catch (error) {
    return {
      platform: 'Facebook',
      status: 'error',
      lastActivity: null,
      isActive: false,
      error: error.message
    };
  }
}

async function checkShopifyStatus(organizationId) {
  try {
    // Validate organizationId before querying
    if (!ObjectId.isValid(organizationId)) {
      throw new Error(`Invalid organizationId format: ${organizationId}`);
    }
    
    const integration = await ShopifyIntegration.findOne({ organizationId });
    
    if (!integration) {
      return {
        platform: 'Shopify',
        status: 'not_configured',
        lastActivity: null,
        isActive: false
      };
    }

    // Check if integration is active
    const isConnected = integration.isActive === true;

    return {
      platform: 'Shopify',
      status: isConnected ? 'connected' : 'disconnected',
      lastActivity: integration.updatedAt,
      isActive: integration.isActive,
      configuredAt: integration.createdAt,
      webhookEndpoint: integration.webhookEndpoint
    };
  } catch (error) {
    return {
      platform: 'Shopify',
      status: 'error',
      lastActivity: null,
      isActive: false,
      error: error.message
    };
  }
}

async function checkWebsiteStatus(organizationId) {
  try {
    // Validate organizationId before querying
    if (!ObjectId.isValid(organizationId)) {
      throw new Error(`Invalid organizationId format: ${organizationId}`);
    }
    
    const integration = await WebsiteIntegration.findOne({ organizationId });
    
    if (!integration) {
      return {
        platform: 'Website',
        status: 'not_configured',
        lastActivity: null,
        isActive: false
      };
    }

    // Website integration is considered connected if it has integrationKey and is active
    const isConnected = integration.integrationKey && integration.isActive === true;

    return {
      platform: 'Website',
      status: isConnected ? 'connected' : 'disconnected',
      lastActivity: integration.updatedAt,
      isActive: integration.isActive,
      domain: integration.domain,
      configuredAt: integration.createdAt,
      isVerified: integration.isVerified
    };
  } catch (error) {
    return {
      platform: 'Website',
      status: 'error',
      lastActivity: null,
      isActive: false,
      error: error.message
    };
  }
}

async function checkWordPressStatus(organizationId) {
  try {
    // Validate organizationId before querying
    if (!ObjectId.isValid(organizationId)) {
      throw new Error(`Invalid organizationId format: ${organizationId}`);
    }
    
    const integration = await WordPressIntegration.findOne({ organizationId });
    
    if (!integration) {
      return {
        platform: 'WordPress',
        status: 'not_configured',
        lastActivity: null,
        isActive: false
      };
    }

    // WordPress integration is connected if it has site URL, API key and is active and connected
    const isConnected = integration.siteUrl && 
                       integration.apiKey &&
                       integration.isActive === true &&
                       integration.connected === true;

    return {
      platform: 'WordPress',
      status: isConnected ? 'connected' : 'disconnected',
      lastActivity: integration.updatedAt,
      isActive: integration.isActive,
      siteUrl: integration.siteUrl,
      configuredAt: integration.createdAt,
      connected: integration.connected
    };
  } catch (error) {
    return {
      platform: 'WordPress',
      status: 'error',
      lastActivity: null,
      isActive: false,
      error: error.message
    };
  }
}

class IntegrationsAnalyticsController {
  // Get integration status for a user/organization
  async getIntegrationsStatus(req, res) {
    try {
      const organizationId = req.user?.organizationId || req.query.organizationId;
      
      console.log('Analytics API called with organizationId:', organizationId);
      
      if (!organizationId) {
        return res.status(400).json({
          success: false,
          message: 'Organization ID is required'
        });
      }

      // Validate organizationId format
      if (!ObjectId.isValid(organizationId)) {
        console.log('❌ Invalid organizationId format:', organizationId);
        return res.status(400).json({
          success: false,
          message: 'Invalid organization ID format',
          error: `Organization ID must be a valid MongoDB ObjectId, received: ${organizationId}`
        });
      }

      // Check each integration status
      const status = {
        facebook: await checkFacebookStatus(organizationId),
        shopify: await checkShopifyStatus(organizationId),
        website: await checkWebsiteStatus(organizationId),
        wordpress: await checkWordPressStatus(organizationId)
      };

      console.log('Integration status results:', status);

      // Count totals
      const summary = {
        total: Object.keys(status).length,
        connected: Object.values(status).filter(s => s.status === 'connected').length,
        disconnected: Object.values(status).filter(s => s.status === 'disconnected').length,
        not_configured: Object.values(status).filter(s => s.status === 'not_configured').length
      };

      res.json({
        success: true,
        data: {
          integrations: status,
          summary
        },
        message: 'Integration status retrieved successfully'
      });

    } catch (error) {
      console.error('Error getting integration status:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve integration status',
        error: error.message
      });
    }
  }
}

module.exports = new IntegrationsAnalyticsController();