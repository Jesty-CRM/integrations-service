const express = require('express');
const router = express.Router();
const formAssignmentService = require('../services/formAssignmentService');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');
const logger = require('../utils/logger');

// Apply authentication to all routes
router.use(authenticateUser);

/**
 * Form Assignment Routes for Facebook Integration
 */

// GET /api/integrations/facebook/:integrationId/pages/:pageId/forms/:formId/assignment - Get form assignment settings
router.get('/facebook/:integrationId/pages/:pageId/forms/:formId/assignment',
  authorizeRoles('admin', 'manager'),
  async (req, res) => {
    try {
      const { integrationId, pageId, formId } = req.params;
      
      const settings = await formAssignmentService.getFormAssignmentSettings(integrationId, pageId, formId);
      
      res.json({
        success: true,
        data: settings,
        message: 'Form assignment settings retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting form assignment settings:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get form assignment settings'
      });
    }
  }
);

// PUT /api/integrations/facebook/:integrationId/pages/:pageId/forms/:formId/assignment - Update form assignment settings
router.put('/facebook/:integrationId/pages/:pageId/forms/:formId/assignment',
  authorizeRoles('admin', 'manager'),
  async (req, res) => {
    try {
      const { integrationId, pageId, formId } = req.params;
      const newSettings = req.body;

      // Validate settings
      if (newSettings.algorithm && !['round-robin', 'weighted-round-robin', 'least-assigned', 'random'].includes(newSettings.algorithm)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid algorithm. Must be round-robin, weighted-round-robin, least-assigned, or random'
        });
      }

      // Validate assignToUsers if provided
      if (newSettings.assignToUsers) {
        for (const user of newSettings.assignToUsers) {
          if (!user.userId) {
            return res.status(400).json({
              success: false,
              message: 'Each user must have a userId'
            });
          }
          if (user.weight && (user.weight < 1 || user.weight > 10)) {
            return res.status(400).json({
              success: false,
              message: 'User weight must be between 1 and 10'
            });
          }
        }
      }

      const updated = await formAssignmentService.updateFormAssignmentSettings(integrationId, pageId, formId, newSettings);
      
      res.json({
        success: true,
        data: updated,
        message: 'Form assignment settings updated successfully'
      });
    } catch (error) {
      logger.error('Error updating form assignment settings:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update form assignment settings'
      });
    }
  }
);

// GET /api/integrations/facebook/:integrationId/pages/:pageId/forms/:formId/assignment/eligible-users - Get eligible users
router.get('/facebook/:integrationId/pages/:pageId/forms/:formId/assignment/eligible-users',
  authorizeRoles('admin', 'manager'),
  async (req, res) => {
    try {
      const organizationId = req.user.organizationId || req.user.companyId;
      const authToken = req.headers.authorization;

      const eligibleUsers = await formAssignmentService.getEligibleUsers(organizationId, authToken);
      
      res.json({
        success: true,
        data: {
          users: eligibleUsers,
          count: eligibleUsers.length
        },
        message: 'Eligible users retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting eligible users:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get eligible users'
      });
    }
  }
);

// GET /api/integrations/facebook/:integrationId/pages/:pageId/forms/:formId/assignment/preview - Preview next assignment
router.get('/facebook/:integrationId/pages/:pageId/forms/:formId/assignment/preview',
  authorizeRoles('admin', 'manager'),
  async (req, res) => {
    try {
      const { integrationId, pageId, formId } = req.params;
      const organizationId = req.user.organizationId || req.user.companyId;
      const authToken = req.headers.authorization;

      const assignmentSettings = await formAssignmentService.getFormAssignmentSettings(integrationId, pageId, formId);
      
      if (!assignmentSettings.enabled) {
        return res.json({
          success: true,
          data: null,
          message: 'Auto-assignment is disabled for this form'
        });
      }

      const eligibleUsers = await formAssignmentService.getEligibleUsers(organizationId, authToken);
      
      if (eligibleUsers.length === 0) {
        return res.json({
          success: true,
          data: null,
          message: 'No eligible users found'
        });
      }

      const nextAssignee = await formAssignmentService.getNextAssignee(eligibleUsers, assignmentSettings, integrationId, pageId, formId);
      
      res.json({
        success: true,
        data: {
          nextAssignee,
          eligibleUsersCount: eligibleUsers.length,
          algorithm: assignmentSettings.algorithm
        },
        message: 'Next assignment preview generated'
      });
    } catch (error) {
      logger.error('Error previewing next assignment:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to preview assignment'
      });
    }
  }
);

// POST /api/integrations/facebook/:integrationId/pages/:pageId/forms/:formId/assignment/assign - Manually assign a lead
router.post('/facebook/:integrationId/pages/:pageId/forms/:formId/assignment/assign',
  authorizeRoles('admin', 'manager'),
  async (req, res) => {
    try {
      const { integrationId, pageId, formId } = req.params;
      const { leadId } = req.body;
      const authToken = req.headers.authorization;

      if (!leadId) {
        return res.status(400).json({
          success: false,
          message: 'leadId is required'
        });
      }

      const result = await formAssignmentService.autoAssignLead(leadId, integrationId, pageId, formId, authToken);
      
      if (result.assigned) {
        res.json({
          success: true,
          data: result,
          message: 'Lead assigned successfully'
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.reason || 'Assignment failed'
        });
      }
    } catch (error) {
      logger.error('Error assigning lead:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to assign lead'
      });
    }
  }
);

// GET /api/integrations/facebook/:integrationId/pages/:pageId/forms/:formId/assignment/stats - Get assignment statistics
router.get('/facebook/:integrationId/pages/:pageId/forms/:formId/assignment/stats',
  authorizeRoles('admin', 'manager'),
  async (req, res) => {
    try {
      const { integrationId, pageId, formId } = req.params;
      
      const stats = await formAssignmentService.getFormAssignmentStats(integrationId, pageId, formId);
      
      res.json({
        success: true,
        data: stats,
        message: 'Assignment statistics retrieved successfully'
      });
    } catch (error) {
      logger.error('Error getting assignment stats:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get assignment statistics'
      });
    }
  }
);

// POST /api/integrations/facebook/:integrationId/pages/:pageId/forms/:formId/assignment/reset - Reset assignment tracking
router.post('/facebook/:integrationId/pages/:pageId/forms/:formId/assignment/reset',
  authorizeRoles('admin'),
  async (req, res) => {
    try {
      const { integrationId, pageId, formId } = req.params;
      
      await formAssignmentService.updateFormAssignmentSettings(integrationId, pageId, formId, {
        'lastAssignment.lastAssignedIndex': 0,
        'lastAssignment.lastAssignedTo': null,
        'lastAssignment.lastAssignedAt': null
      });
      
      res.json({
        success: true,
        message: 'Assignment tracking reset successfully'
      });
    } catch (error) {
      logger.error('Error resetting assignment tracking:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to reset assignment tracking'
      });
    }
  }
);

module.exports = router;