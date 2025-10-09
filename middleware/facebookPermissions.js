const FacebookIntegration = require('../models/FacebookIntegration');
const logger = require('../utils/logger');

/**
 * Middleware to check if the Facebook integration has required permissions
 * @param {string[]} requiredPermissions - Array of required Facebook permissions
 * @returns {Function} Express middleware function
 */
const checkFacebookPermissions = (requiredPermissions = []) => {
  return async (req, res, next) => {
    try {
      const { organizationId } = req.user;

      // Find the Facebook integration for this organization
      const integration = await FacebookIntegration.findOne({ 
        organizationId,
        connected: true
      });

      if (!integration) {
        return res.status(404).json({
          success: false,
          message: 'Facebook integration not found or not connected'
        });
      }

      // Check if integration has granted permissions stored
      if (!integration.grantedPermissions || !Array.isArray(integration.grantedPermissions)) {
        logger.warn('Facebook integration has no granted permissions stored:', {
          organizationId,
          integrationId: integration._id
        });
        
        // If no permissions stored, assume basic access only
        const basicPermissions = ['pages_show_list'];
        integration.grantedPermissions = basicPermissions;
        await integration.save();
      }

      // Check if all required permissions are granted
      const missingPermissions = requiredPermissions.filter(
        permission => !integration.grantedPermissions.includes(permission)
      );

      if (missingPermissions.length > 0) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient Facebook permissions',
          error: {
            type: 'INSUFFICIENT_PERMISSIONS',
            required: requiredPermissions,
            granted: integration.grantedPermissions,
            missing: missingPermissions,
            integrationId: integration._id
          },
          action: 'RECONNECT_FACEBOOK'
        });
      }

      // Add integration to request for use in controllers
      req.facebookIntegration = integration;
      next();
    } catch (error) {
      logger.error('Error checking Facebook permissions:', error);
      res.status(500).json({
        success: false,
        message: 'Error validating Facebook permissions',
        error: error.message
      });
    }
  };
};

/**
 * Predefined permission groups for common operations
 */
const PERMISSION_GROUPS = {
  BASIC: ['pages_show_list'],
  LEADS: ['pages_show_list', 'leads_retrieval', 'pages_read_engagement'],
  PAGE_MANAGEMENT: ['pages_show_list', 'pages_manage_metadata'],
  ADS_READ: ['pages_show_list', 'ads_read'],
  ADS_MANAGE: ['pages_show_list', 'ads_read', 'pages_manage_ads'],
  BUSINESS: ['pages_show_list', 'business_management'],
  FULL_ACCESS: [
    'pages_show_list',
    'leads_retrieval',
    'pages_read_engagement',
    'pages_manage_metadata',
    'pages_manage_ads',
    'business_management',
    'ads_read'
  ]
};

/**
 * Helper functions for common permission checks
 */
const requireBasicAccess = () => checkFacebookPermissions(PERMISSION_GROUPS.BASIC);
const requireLeadsAccess = () => checkFacebookPermissions(PERMISSION_GROUPS.LEADS);
const requirePageManagement = () => checkFacebookPermissions(PERMISSION_GROUPS.PAGE_MANAGEMENT);
const requireAdsRead = () => checkFacebookPermissions(PERMISSION_GROUPS.ADS_READ);
const requireAdsManage = () => checkFacebookPermissions(PERMISSION_GROUPS.ADS_MANAGE);
const requireBusinessAccess = () => checkFacebookPermissions(PERMISSION_GROUPS.BUSINESS);
const requireFullAccess = () => checkFacebookPermissions(PERMISSION_GROUPS.FULL_ACCESS);

module.exports = {
  checkFacebookPermissions,
  PERMISSION_GROUPS,
  requireBasicAccess,
  requireLeadsAccess,
  requirePageManagement,
  requireAdsRead,
  requireAdsManage,
  requireBusinessAccess,
  requireFullAccess
};