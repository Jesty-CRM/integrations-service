const logger = require('../utils/logger');

/**
 * Middleware to check if user has required permissions
 * @param {string|string[]} requiredPermissions - Permission(s) required
 * @returns {Function} Express middleware function
 */
const requirePermissions = (...requiredPermissions) => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const userPermissions = req.user.permissions || [];
      const hasPermission = requiredPermissions.some(permission => 
        userPermissions.includes(permission)
      );

      if (!hasPermission) {
        logger.warn('User lacks required permissions:', {
          userId: req.user.id,
          userPermissions,
          requiredPermissions,
          organizationId: req.user.organizationId
        });

        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions to access this resource',
          error: {
            type: 'INSUFFICIENT_USER_PERMISSIONS',
            required: requiredPermissions,
            userPermissions: userPermissions
          }
        });
      }

      next();
    } catch (error) {
      logger.error('Error checking user permissions:', error);
      res.status(500).json({
        success: false,
        message: 'Error validating user permissions'
      });
    }
  };
};

/**
 * Check if user has admin role
 */
const requireAdmin = () => {
  return (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const userRoles = req.user.roles || [];
      const isAdmin = userRoles.includes('admin');

      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Admin access required'
        });
      }

      next();
    } catch (error) {
      logger.error('Error checking admin role:', error);
      res.status(500).json({
        success: false,
        message: 'Error validating admin role'
      });
    }
  };
};

/**
 * Check if user can manage integrations
 */
const requireIntegrationAccess = () => requirePermissions('manage_integrations');

/**
 * Check if user can manage team members
 */
const requireTeamManagement = () => requirePermissions('manage_team_members');

module.exports = {
  requirePermissions,
  requireAdmin,
  requireIntegrationAccess,
  requireTeamManagement
};