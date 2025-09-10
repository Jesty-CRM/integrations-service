const IntegrationConfig = require('../models/IntegrationConfig');
const facebookService = require('../services/facebook.service');
const linkedinService = require('../services/linkedin.service');
const shopifyService = require('../services/shopify.service');
const logger = require('../utils/logger');

class IntegrationsController {
  // Get all integrations for a company
  async getIntegrations(req, res) {
    try {
      const { companyId } = req.user;
      
      const integrations = await IntegrationConfig.find({ companyId })
        .select('-credentials.accessToken -credentials.refreshToken -credentials.apiSecret');

      res.status(200).json({
        success: true,
        data: integrations
      });

    } catch (error) {
      logger.error('Get integrations error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch integrations'
      });
    }
  }

  // Get specific integration
  async getIntegration(req, res) {
    try {
      const { provider } = req.params;
      const { companyId } = req.user;

      const integration = await IntegrationConfig.findOne({ 
        provider, 
        companyId 
      }).select('-credentials.accessToken -credentials.refreshToken -credentials.apiSecret');

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      res.status(200).json({
        success: true,
        data: integration
      });

    } catch (error) {
      logger.error('Get integration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch integration'
      });
    }
  }

  // Create or update integration
  async createIntegration(req, res) {
    try {
      const { provider, name, description, settings, credentials } = req.body;
      const { companyId } = req.user;

      // Validate provider
      const validProviders = ['facebook', 'linkedin', 'shopify', 'google', 'zapier', 'mailchimp'];
      if (!validProviders.includes(provider)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid provider'
        });
      }

      // Check if integration already exists
      let integration = await IntegrationConfig.findOne({ provider, companyId });

      if (integration) {
        // Update existing integration
        integration.name = name || integration.name;
        integration.description = description || integration.description;
        integration.settings = { ...integration.settings, ...settings };
        integration.credentials = { ...integration.credentials, ...credentials };
        integration.updatedAt = new Date();
        
        await integration.save();
      } else {
        // Create new integration
        integration = new IntegrationConfig({
          provider,
          name,
          description,
          companyId,
          settings: settings || {},
          credentials: credentials || {},
          isActive: false // Will be activated after successful connection
        });

        await integration.save();
      }

      logger.info('Integration created/updated', { provider, companyId });

      res.status(200).json({
        success: true,
        message: 'Integration saved successfully',
        data: {
          id: integration._id,
          provider: integration.provider,
          name: integration.name,
          isActive: integration.isActive
        }
      });

    } catch (error) {
      logger.error('Create integration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create integration'
      });
    }
  }

  // Test integration connection
  async testIntegration(req, res) {
    try {
      const { provider } = req.params;
      const { companyId } = req.user;

      const integration = await IntegrationConfig.findOne({ provider, companyId });
      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      let testResult;

      switch (provider) {
        case 'facebook':
          testResult = await facebookService.testConnection(integration.credentials);
          break;
        case 'linkedin':
          testResult = await linkedinService.testConnection(integration.credentials);
          break;
        case 'shopify':
          testResult = await shopifyService.testConnection(integration.credentials);
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Provider not supported for testing'
          });
      }

      // Update integration status based on test result
      integration.isActive = testResult.success;
      integration.lastTested = new Date();
      if (testResult.success) {
        integration.lastSync = new Date();
      }
      await integration.save();

      res.status(200).json({
        success: true,
        message: testResult.success ? 'Connection successful' : 'Connection failed',
        data: testResult
      });

    } catch (error) {
      logger.error('Test integration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to test integration'
      });
    }
  }

  // Sync data from integration
  async syncIntegration(req, res) {
    try {
      const { provider } = req.params;
      const { companyId } = req.user;
      const { syncType = 'full' } = req.body; // 'full' or 'incremental'

      const integration = await IntegrationConfig.findOne({ provider, companyId });
      if (!integration || !integration.isActive) {
        return res.status(400).json({
          success: false,
          message: 'Integration not found or inactive'
        });
      }

      let syncResult;

      switch (provider) {
        case 'facebook':
          syncResult = await facebookService.syncData(integration, syncType);
          break;
        case 'linkedin':
          syncResult = await linkedinService.syncData(integration, syncType);
          break;
        case 'shopify':
          syncResult = await shopifyService.syncData(integration, syncType);
          break;
        default:
          return res.status(400).json({
            success: false,
            message: 'Provider not supported for sync'
          });
      }

      // Update sync status
      integration.lastSync = new Date();
      integration.syncStats = {
        lastSyncType: syncType,
        recordsProcessed: syncResult.recordsProcessed || 0,
        recordsCreated: syncResult.recordsCreated || 0,
        recordsUpdated: syncResult.recordsUpdated || 0,
        errors: syncResult.errors || 0
      };
      await integration.save();

      res.status(200).json({
        success: true,
        message: 'Sync completed successfully',
        data: syncResult
      });

    } catch (error) {
      logger.error('Sync integration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to sync integration'
      });
    }
  }

  // Disable integration
  async disableIntegration(req, res) {
    try {
      const { provider } = req.params;
      const { companyId } = req.user;

      const integration = await IntegrationConfig.findOne({ provider, companyId });
      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      integration.isActive = false;
      integration.updatedAt = new Date();
      await integration.save();

      logger.info('Integration disabled', { provider, companyId });

      res.status(200).json({
        success: true,
        message: 'Integration disabled successfully'
      });

    } catch (error) {
      logger.error('Disable integration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to disable integration'
      });
    }
  }

  // Delete integration
  async deleteIntegration(req, res) {
    try {
      const { provider } = req.params;
      const { companyId } = req.user;

      const integration = await IntegrationConfig.findOneAndDelete({ 
        provider, 
        companyId 
      });

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      logger.info('Integration deleted', { provider, companyId });

      res.status(200).json({
        success: true,
        message: 'Integration deleted successfully'
      });

    } catch (error) {
      logger.error('Delete integration error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete integration'
      });
    }
  }

  // Get integration logs
  async getIntegrationLogs(req, res) {
    try {
      const { provider } = req.params;
      const { companyId } = req.user;
      const { limit = 50, offset = 0 } = req.query;

      const integration = await IntegrationConfig.findOne({ provider, companyId });
      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Integration not found'
        });
      }

      // Get logs from integration logs collection or array
      const logs = integration.logs
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(offset, offset + limit);

      res.status(200).json({
        success: true,
        data: {
          logs,
          total: integration.logs.length,
          hasMore: offset + limit < integration.logs.length
        }
      });

    } catch (error) {
      logger.error('Get integration logs error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch integration logs'
      });
    }
  }
}

module.exports = new IntegrationsController();
