const assignmentService = require('../services/assignmentService');

class AssignmentController {
  /**
   * Get assignment settings for an integration
   */
  async getAssignmentSettings(req, res) {
    try {
      const { integrationType, integrationId } = req.params;
      
      const settings = await assignmentService.getIntegrationAssignmentSettings(integrationType, integrationId);
      
      res.json({
        success: true,
        data: settings,
        message: 'Assignment settings retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting assignment settings:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get assignment settings'
      });
    }
  }

  /**
   * Update assignment settings for an integration
   */
  async updateAssignmentSettings(req, res) {
    try {
      const { integrationType, integrationId } = req.params;
      const newSettings = req.body;

      // Validate settings
      if (newSettings.mode && !['auto', 'manual', 'specific'].includes(newSettings.mode)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid assignment mode. Must be auto, manual, or specific'
        });
      }

      if (newSettings.algorithm && !['round-robin', 'weighted-round-robin', 'least-active', 'random'].includes(newSettings.algorithm)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid algorithm. Must be round-robin, weighted-round-robin, least-active, or random'
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

      const updated = await assignmentService.updateAssignmentSettings(integrationType, integrationId, newSettings);
      
      res.json({
        success: true,
        data: updated,
        message: 'Assignment settings updated successfully'
      });
    } catch (error) {
      console.error('Error updating assignment settings:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to update assignment settings'
      });
    }
  }

  /**
   * Get eligible users for assignment based on current settings
   */
  async getEligibleUsers(req, res) {
    try {
      const { integrationType, integrationId } = req.params;
      const organizationId = req.user.organizationId || req.user.companyId;
      const authToken = req.headers.authorization;

      const assignmentSettings = await assignmentService.getIntegrationAssignmentSettings(integrationType, integrationId);
      const eligibleUsers = await assignmentService.getEligibleUsers(organizationId, assignmentSettings, authToken);
      
      res.json({
        success: true,
        data: {
          users: eligibleUsers,
          settings: assignmentSettings,
          count: eligibleUsers.length
        },
        message: 'Eligible users retrieved successfully'
      });
    } catch (error) {
      console.error('Error getting eligible users:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get eligible users'
      });
    }
  }

  /**
   * Test assignment algorithm - preview who would get the next assignment
   */
  async previewNextAssignment(req, res) {
    try {
      const { integrationType, integrationId } = req.params;
      const organizationId = req.user.organizationId || req.user.companyId;
      const authToken = req.headers.authorization;

      const assignmentSettings = await assignmentService.getIntegrationAssignmentSettings(integrationType, integrationId);
      
      if (!assignmentSettings.enabled || assignmentSettings.mode === 'manual') {
        return res.json({
          success: true,
          data: null,
          message: 'Auto-assignment is disabled'
        });
      }

      const eligibleUsers = await assignmentService.getEligibleUsers(organizationId, assignmentSettings, authToken);
      
      if (eligibleUsers.length === 0) {
        return res.json({
          success: true,
          data: null,
          message: 'No eligible users found'
        });
      }

      const nextAssignee = await assignmentService.getNextAssignee(eligibleUsers, assignmentSettings, integrationType, integrationId);
      
      res.json({
        success: true,
        data: {
          nextAssignee,
          eligibleUsersCount: eligibleUsers.length,
          algorithm: assignmentSettings.algorithm,
          mode: assignmentSettings.mode
        },
        message: 'Next assignment preview generated'
      });
    } catch (error) {
      console.error('Error previewing next assignment:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to preview assignment'
      });
    }
  }

  /**
   * Manually trigger auto-assignment for a lead
   */
  async assignLead(req, res) {
    try {
      const { integrationType, integrationId } = req.params;
      const { leadId } = req.body;
      const authToken = req.headers.authorization;

      if (!leadId) {
        return res.status(400).json({
          success: false,
          message: 'leadId is required'
        });
      }

      const result = await assignmentService.autoAssignLead(leadId, integrationType, integrationId, authToken);
      
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
      console.error('Error assigning lead:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to assign lead'
      });
    }
  }

  /**
   * Get assignment statistics for an integration
   */
  async getAssignmentStats(req, res) {
    try {
      const { integrationType, integrationId } = req.params;
      
      // This would be implemented based on your needs
      // Could show distribution stats, recent assignments, etc.
      
      res.json({
        success: true,
        data: {
          message: 'Assignment statistics endpoint - to be implemented'
        }
      });
    } catch (error) {
      console.error('Error getting assignment stats:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get assignment statistics'
      });
    }
  }

  /**
   * Reset assignment tracking (start round-robin from beginning)
   */
  async resetAssignmentTracking(req, res) {
    try {
      const { integrationType, integrationId } = req.params;
      
      await assignmentService.updateAssignmentSettings(integrationType, integrationId, {
        'lastAssignment.roundRobinIndex': 0,
        'lastAssignment.userId': null,
        'lastAssignment.timestamp': null
      });
      
      res.json({
        success: true,
        message: 'Assignment tracking reset successfully'
      });
    } catch (error) {
      console.error('Error resetting assignment tracking:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to reset assignment tracking'
      });
    }
  }
}

module.exports = new AssignmentController();