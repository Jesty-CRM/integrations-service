const axios = require('axios');
const mongoose = require('mongoose');
const FacebookIntegration = require('../models/FacebookIntegration');
const logger = require('../utils/logger');

class FormAssignmentService {
  constructor() {
    this.authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3000';
    this.leadsServiceUrl = process.env.LEADS_SERVICE_URL || 'http://localhost:3002';
  }

  /**
   * Get assignment settings for a specific form
   */
  async getFormAssignmentSettings(integrationId, pageId, formId) {
    try {
      const integration = await FacebookIntegration.findById(integrationId);
      
      if (!integration) {
        throw new Error('Integration not found');
      }

      const page = integration.fbPages.find(p => p.id === pageId);
      if (!page) {
        throw new Error('Page not found');
      }

      const form = page.leadForms.find(f => f.id === formId);
      if (!form) {
        throw new Error('Form not found');
      }

      return form.assignmentSettings || {
        enabled: false,
        algorithm: 'round-robin',
        assignToUsers: [],
        lastAssignment: {
          mode: 'manual',
          lastAssignedIndex: 0,
          lastAssignedAt: null,
          lastAssignedTo: null
        }
      };
    } catch (error) {
      logger.error('Error getting form assignment settings:', error);
      throw error;
    }
  }

  /**
   * Update assignment settings for a specific form
   */
  async updateFormAssignmentSettings(integrationId, pageId, formId, newSettings) {
    try {
      const integration = await FacebookIntegration.findById(integrationId);
      
      if (!integration) {
        throw new Error('Integration not found');
      }

      const pageIndex = integration.fbPages.findIndex(p => p.id === pageId);
      if (pageIndex === -1) {
        throw new Error('Page not found');
      }

      const formIndex = integration.fbPages[pageIndex].leadForms.findIndex(f => f.id === formId);
      if (formIndex === -1) {
        throw new Error('Form not found');
      }

      // Update form assignment settings
      integration.fbPages[pageIndex].leadForms[formIndex].assignmentSettings = {
        ...integration.fbPages[pageIndex].leadForms[formIndex].assignmentSettings,
        ...newSettings
      };

      await integration.save();

      return integration.fbPages[pageIndex].leadForms[formIndex].assignmentSettings;
    } catch (error) {
      logger.error('Error updating form assignment settings:', error);
      throw error;
    }
  }

  /**
   * Get eligible users for assignment
   */
  async getEligibleUsers(organizationId, authToken) {
    try {
      const response = await axios.get(`${this.authServiceUrl}/api/users/organization/${organizationId}`, {
        headers: {
          'Authorization': authToken,
          'Content-Type': 'application/json'
        }
      });

      return response.data.data || [];
    } catch (error) {
      logger.error('Error fetching eligible users:', error);
      throw new Error('Failed to fetch eligible users');
    }
  }

  /**
   * Get next assignee based on assignment algorithm
   */
  async getNextAssignee(eligibleUsers, assignmentSettings, integrationId, pageId, formId) {
    try {
      const activeUsers = assignmentSettings.assignToUsers.filter(u => u.isActive);
      
      if (activeUsers.length === 0) {
        return null;
      }

      let nextUser = null;

      switch (assignmentSettings.algorithm) {
        case 'round-robin':
          nextUser = this.roundRobinAssignment(activeUsers, assignmentSettings.lastAssignment);
          break;
        case 'weighted-round-robin':
          nextUser = this.weightedRoundRobinAssignment(activeUsers, assignmentSettings.lastAssignment);
          break;
        case 'random':
          nextUser = this.randomAssignment(activeUsers);
          break;
        case 'least-assigned':
          nextUser = await this.leastAssignedAlgorithm(activeUsers, integrationId, pageId, formId);
          break;
        default:
          nextUser = this.roundRobinAssignment(activeUsers, assignmentSettings.lastAssignment);
      }

      // Update last assignment tracking
      if (nextUser) {
        await this.updateLastAssignment(integrationId, pageId, formId, nextUser);
      }

      return nextUser;
    } catch (error) {
      logger.error('Error getting next assignee:', error);
      throw error;
    }
  }

  /**
   * Round-robin assignment algorithm
   */
  roundRobinAssignment(activeUsers, lastAssignment) {
    const currentIndex = lastAssignment.lastAssignedIndex || 0;
    const nextIndex = (currentIndex + 1) % activeUsers.length;
    return {
      user: activeUsers[nextIndex],
      nextIndex: nextIndex
    };
  }

  /**
   * Weighted round-robin assignment algorithm
   */
  weightedRoundRobinAssignment(activeUsers, lastAssignment) {
    // Create weighted list
    const weightedUsers = [];
    activeUsers.forEach(user => {
      for (let i = 0; i < user.weight; i++) {
        weightedUsers.push(user);
      }
    });

    const currentIndex = lastAssignment.lastAssignedIndex || 0;
    const nextIndex = (currentIndex + 1) % weightedUsers.length;
    
    return {
      user: weightedUsers[nextIndex],
      nextIndex: nextIndex
    };
  }

  /**
   * Random assignment algorithm
   */
  randomAssignment(activeUsers) {
    const randomIndex = Math.floor(Math.random() * activeUsers.length);
    return {
      user: activeUsers[randomIndex],
      nextIndex: randomIndex
    };
  }

  /**
   * Least assigned algorithm
   */
  async leastAssignedAlgorithm(activeUsers, integrationId, pageId, formId) {
    try {
      // Get assignment counts for each user from leads service
      const userCounts = await this.getAssignmentCounts(activeUsers, integrationId, pageId, formId);
      
      // Find user with least assignments
      let leastAssignedUser = activeUsers[0];
      let minCount = userCounts[leastAssignedUser.userId] || 0;
      
      activeUsers.forEach(user => {
        const count = userCounts[user.userId] || 0;
        if (count < minCount) {
          minCount = count;
          leastAssignedUser = user;
        }
      });

      return {
        user: leastAssignedUser,
        nextIndex: 0 // Not relevant for least-assigned
      };
    } catch (error) {
      logger.error('Error in least assigned algorithm:', error);
      // Fallback to round-robin
      return this.roundRobinAssignment(activeUsers, { lastAssignedIndex: 0 });
    }
  }

  /**
   * Get assignment counts for users
   */
  async getAssignmentCounts(activeUsers, integrationId, pageId, formId) {
    try {
      // This would query the leads service to get counts
      // For now, return empty counts
      const counts = {};
      activeUsers.forEach(user => {
        counts[user.userId] = 0;
      });
      return counts;
    } catch (error) {
      logger.error('Error getting assignment counts:', error);
      return {};
    }
  }

  /**
   * Update last assignment tracking
   */
  async updateLastAssignment(integrationId, pageId, formId, assignmentResult) {
    try {
      await FacebookIntegration.findOneAndUpdate(
        {
          _id: integrationId,
          'fbPages.id': pageId,
          'fbPages.leadForms.id': formId
        },
        {
          $set: {
            'fbPages.$[page].leadForms.$[form].assignmentSettings.lastAssignment': {
              mode: 'automatic',
              lastAssignedIndex: assignmentResult.nextIndex,
              lastAssignedAt: new Date(),
              lastAssignedTo: assignmentResult.user.userId
            }
          }
        },
        {
          arrayFilters: [
            { 'page.id': pageId },
            { 'form.id': formId }
          ]
        }
      );
    } catch (error) {
      logger.error('Error updating last assignment:', error);
    }
  }

  /**
   * Auto-assign lead to user based on form settings
   */
  async autoAssignLead(leadId, integrationId, pageId, formId, authToken) {
    try {
      // Get form assignment settings
      const assignmentSettings = await this.getFormAssignmentSettings(integrationId, pageId, formId);
      
      if (!assignmentSettings.enabled) {
        return {
          assigned: false,
          reason: 'Auto-assignment disabled for this form'
        };
      }

      // Get the integration to get organization ID
      const integration = await FacebookIntegration.findById(integrationId);
      if (!integration) {
        return {
          assigned: false,
          reason: 'Integration not found'
        };
      }

      // Get eligible users from assignment settings
      const activeUsers = assignmentSettings.assignToUsers.filter(u => u.isActive);
      
      if (activeUsers.length === 0) {
        return {
          assigned: false,
          reason: 'No active users found in assignment settings'
        };
      }

      // Get next assignee
      const assignmentResult = await this.getNextAssignee(
        activeUsers, 
        assignmentSettings, 
        integrationId, 
        pageId, 
        formId
      );

      if (!assignmentResult) {
        return {
          assigned: false,
          reason: 'No user available for assignment'
        };
      }

      // Actually assign the lead to the user via leads service
      try {
        const assignmentResponse = await this.assignLeadToUserViaService(
          leadId, 
          assignmentResult.user.userId,
          integration.organizationId
        );

        if (assignmentResponse.success) {
          logger.info('Lead successfully auto-assigned:', {
            leadId,
            userId: assignmentResult.user.userId,
            algorithm: assignmentSettings.algorithm
          });

          return {
            assigned: true,
            assignedTo: assignmentResult.user,
            algorithm: assignmentSettings.algorithm,
            leadId: leadId
          };
        } else {
          logger.error('Failed to assign lead via leads service:', assignmentResponse.error);
          return {
            assigned: false,
            reason: `Lead assignment failed: ${assignmentResponse.error}`
          };
        }
      } catch (serviceError) {
        logger.error('Error calling leads service for assignment:', serviceError);
        return {
          assigned: false,
          reason: 'Failed to communicate with leads service'
        };
      }
    } catch (error) {
      logger.error('Error auto-assigning lead:', error);
      return {
        assigned: false,
        reason: error.message
      };
    }
  }

  /**
   * Assign lead to specific user via leads service
   */
  async assignLeadToUser(leadId, userId, authToken) {
    try {
      const response = await axios.put(
        `${this.leadsServiceUrl}/api/leads/${leadId}/assign`,
        { assignedTo: userId },
        {
          headers: {
            'Authorization': authToken,
            'Content-Type': 'application/json'
          }
        }
      );

      return { success: true, data: response.data };
    } catch (error) {
      logger.error('Error assigning lead to user:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Assign lead to specific user via leads service (internal service call)
   */
  async assignLeadToUserViaService(leadId, userId, organizationId) {
    try {
      // Use internal service token for service-to-service communication
      const serviceToken = process.env.SERVICE_AUTH_TOKEN || 'integrations-service-auth-token';
      
      const response = await axios.put(
        `${this.leadsServiceUrl}/api/leads/${leadId}/assign`,
        { 
          assignedTo: userId,
          reason: 'auto-assignment',
          source: 'facebook-integration'
        },
        {
          headers: {
            'X-Service-Auth': serviceToken,
            'X-Organization-Id': organizationId,
            'Content-Type': 'application/json'
          }
        }
      );

      logger.info('Lead assigned via service call:', {
        leadId,
        userId,
        status: response.status,
        success: response.data?.success
      });

      return { success: true, data: response.data };
    } catch (error) {
      logger.error('Error assigning lead via service:', {
        leadId,
        userId,
        error: error.response?.data || error.message,
        status: error.response?.status
      });
      return { 
        success: false, 
        error: error.response?.data?.message || error.message 
      };
    }
  }

  /**
   * Get form assignment statistics
   */
  async getFormAssignmentStats(integrationId, pageId, formId) {
    try {
      const assignmentSettings = await this.getFormAssignmentSettings(integrationId, pageId, formId);
      
      return {
        enabled: assignmentSettings.enabled,
        algorithm: assignmentSettings.algorithm,
        totalUsers: assignmentSettings.assignToUsers?.length || 0,
        activeUsers: assignmentSettings.assignToUsers?.filter(u => u.isActive)?.length || 0,
        lastAssignment: assignmentSettings.lastAssignment
      };
    } catch (error) {
      logger.error('Error getting form assignment stats:', error);
      throw error;
    }
  }
}

module.exports = new FormAssignmentService();