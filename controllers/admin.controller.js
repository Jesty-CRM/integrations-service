const IntegrationConfig = require('../models/IntegrationConfig');
const logger = require('../utils/logger');

class AdminController {
  // Delete all organization integration data - ADMIN ONLY
  async deleteOrganizationData(req, res) {
    try {
      const { organizationId } = req.params;
      const { service } = req.user;

      // Only allow service-to-service calls from auth-service
      if (!service || service !== 'auth-service-deletion') {
        logger.error('Unauthorized organization data deletion attempt', {
          organizationId,
          user: req.user
        });
        return res.status(403).json({
          success: false,
          message: 'Unauthorized access'
        });
      }

      logger.warn('ORGANIZATION DATA DELETION INITIATED - INTEGRATIONS SERVICE', {
        organizationId,
        requestedBy: req.user,
        timestamp: new Date().toISOString()
      });

      // Count data before deletion for reporting
      const stats = {
        integrations: await IntegrationConfig.countDocuments({ companyId: organizationId })
      };

      logger.info('Integration data count before deletion', {
        organizationId,
        stats
      });

      // Delete all integration configurations for this organization
      const deletedIntegrations = await IntegrationConfig.deleteMany({ companyId: organizationId });

      const deletionResults = {
        integrations: deletedIntegrations.deletedCount
      };

      logger.warn('ORGANIZATION DATA DELETION COMPLETED - INTEGRATIONS SERVICE', {
        organizationId,
        deletionResults,
        originalStats: stats,
        completedAt: new Date().toISOString()
      });

      res.status(200).json({
        success: true,
        data: {
          organizationId,
          deletedData: deletionResults,
          message: 'All organization integration data deleted successfully'
        }
      });

    } catch (error) {
      logger.error('Delete organization integration data error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete organization integration data',
        error: error.message
      });
    }
  }
}

module.exports = new AdminController();