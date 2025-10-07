const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Import integration models
const WebsiteIntegration = require('../models/WebsiteIntegration');
const FacebookIntegration = require('../models/FacebookIntegration');
const ShopifyIntegration = require('../models/ShopifyIntegration');
const IntegrationConfig = require('../models/IntegrationConfig');

class IntegrationAssignmentService {
  constructor() {
    this.authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3000';
    this.leadsServiceUrl = process.env.LEADS_SERVICE_URL || 'http://localhost:3002';
  }

  /**
   * Generate service-to-service JWT token for authentication
   */
  generateServiceToken(organizationId) {
    const payload = {
      id: 'integrations-service',
      userId: 'integrations-service', 
      type: 'access',
      email: 'service@integrations.jestycrm.com',
      roles: ['admin', 'service'],
      role: 'admin',
      organizationId: organizationId,
      permissions: [],
      service: 'integrations-service'
    };

    const token = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
      expiresIn: '1h',
      audience: 'jesty-crm-users',
      issuer: 'jesty-crm'
    });

    return token;
  }

  /**
   * Get assignment settings for a specific integration
   */
  async getIntegrationAssignmentSettings(integrationType, integrationId) {
    try {
      let integration;
      
      switch (integrationType.toLowerCase()) {
        case 'website':
          integration = await WebsiteIntegration.findById(integrationId);
          break;
        case 'facebook':
          integration = await FacebookIntegration.findById(integrationId);
          break;
        case 'shopify':
          integration = await ShopifyIntegration.findById(integrationId);
          break;
        default:
          integration = await IntegrationConfig.findById(integrationId);
      }

      if (!integration) {
        throw new Error(`Integration not found: ${integrationId}`);
      }

      return integration.assignmentSettings || integration.assignmentConfig || {
        enabled: false,
        mode: 'manual',
        algorithm: 'weighted-round-robin',
        assignToUsers: []
      };
    } catch (error) {
      console.error('Error getting integration assignment settings:', error);
      throw error;
    }
  }

  /**
   * Get eligible users for assignment based on integration settings
   */
  async getEligibleUsers(organizationId, assignmentSettings, authToken = null) {
    try {
      if (assignmentSettings.mode === 'manual' || !assignmentSettings.enabled) {
        return [];
      }

      let eligibleUsers = [];

      if (assignmentSettings.mode === 'specific') {
        // For website leads, use the user info from assignToUsers directly (no auth needed)
        if (!authToken) {
          // Use assignToUsers directly without calling auth-service
          eligibleUsers = assignmentSettings.assignToUsers.map(user => ({
            _id: user.userId,
            userId: user.userId,
            weight: user.weight || 1,
            name: user.name || 'User',
            email: user.email || ''
          }));
          
          console.log('Using direct assignment for website lead:', {
            mode: assignmentSettings.mode,
            eligibleUsers: eligibleUsers.length
          });
          
          return eligibleUsers;
        }
        
        // Original auth-based logic for other sources
        const userIds = assignmentSettings.assignToUsers.map(u => u.userId);
        if (userIds.length === 0) return [];
        
        const response = await axios.get(`${this.authServiceUrl}/api/users/by-ids`, {
          headers: { Authorization: authToken },
          params: { ids: userIds.join(','), organizationId }
        });
        
        eligibleUsers = response.data.data || [];
        
        // Add weight information
        eligibleUsers = eligibleUsers.map(user => {
          const settingsUser = assignmentSettings.assignToUsers.find(u => u.userId.toString() === user._id.toString());
          return {
            ...user,
            weight: settingsUser ? settingsUser.weight : 1
          };
        });
      } else if (assignmentSettings.mode === 'auto') {
        // For website leads without auth, use assignToUsers directly (same as specific mode)
        if (!authToken) {
          console.log('Auto mode for website lead - using assignToUsers directly');
          
          if (assignmentSettings.assignToUsers && assignmentSettings.assignToUsers.length > 0) {
            eligibleUsers = assignmentSettings.assignToUsers.map(user => ({
              _id: user.userId,
              userId: user.userId,
              weight: user.weight || 1,
              name: user.name || 'User',
              email: user.email || ''
            }));
            
            console.log('Found eligible users for auto assignment:', {
              count: eligibleUsers.length,
              users: eligibleUsers.map(u => ({ id: u.userId, weight: u.weight }))
            });
            
            return eligibleUsers;
          } else {
            console.log('No assignToUsers configured for auto assignment');
            return [];
          }
        }
        
        // Get all telecallers in the organization (requires auth)
        const response = await axios.get(`${this.authServiceUrl}/api/users/telecallers`, {
          headers: { Authorization: authToken },
          params: { organizationId }
        });
        
        eligibleUsers = (response.data.data || []).map(user => ({
          ...user,
          weight: 1 // Equal weight for auto mode
        }));
      }

      return eligibleUsers;
    } catch (error) {
      console.error('Error getting eligible users:', error);
      throw error;
    }
  }



  /**
   * Get the next user to assign based on algorithm
   */
  async getNextAssignee(eligibleUsers, assignmentSettings, integrationType, integrationId) {
    if (!eligibleUsers || eligibleUsers.length === 0) {
      return null;
    }

    const algorithm = assignmentSettings.algorithm || 'weighted-round-robin';
    let selectedUser = null;

    switch (algorithm) {
      case 'round-robin':
        selectedUser = await this.getRoundRobinAssignee(eligibleUsers, assignmentSettings, integrationType, integrationId);
        break;
      case 'weighted-round-robin':
        selectedUser = await this.getWeightedRoundRobinAssignee(eligibleUsers, assignmentSettings, integrationType, integrationId);
        break;
      case 'least-active':
        selectedUser = await this.getLeastActiveAssignee(eligibleUsers);
        break;
      case 'random':
        selectedUser = this.getRandomAssignee(eligibleUsers);
        break;
      default:
        selectedUser = await this.getWeightedRoundRobinAssignee(eligibleUsers, assignmentSettings, integrationType, integrationId);
    }

    // Update assignment tracking
    if (selectedUser) {
      await this.updateAssignmentTracking(integrationType, integrationId, selectedUser._id, eligibleUsers);
    }

    return selectedUser;
  }

  /**
   * Simple round-robin assignment
   */
  async getRoundRobinAssignee(eligibleUsers, assignmentSettings, integrationType, integrationId) {
    const currentIndex = assignmentSettings.lastAssignment?.roundRobinIndex || 0;
    const nextIndex = currentIndex >= eligibleUsers.length - 1 ? 0 : currentIndex + 1;
    
    return eligibleUsers[nextIndex];
  }

  /**
   * Weighted round-robin assignment (recommended algorithm)
   * This gives better distribution when users have different weights
   */
  async getWeightedRoundRobinAssignee(eligibleUsers, assignmentSettings, integrationType, integrationId) {
    // Create weighted list where each user appears according to their weight
    const weightedUsers = [];
    
    eligibleUsers.forEach(user => {
      const weight = user.weight || 1;
      for (let i = 0; i < weight; i++) {
        weightedUsers.push(user);
      }
    });

    if (weightedUsers.length === 0) return null;

    const currentIndex = assignmentSettings.lastAssignment?.roundRobinIndex || 0;
    const nextIndex = currentIndex >= weightedUsers.length - 1 ? 0 : currentIndex + 1;
    
    return weightedUsers[nextIndex];
  }

  /**
   * Assign to user with least active leads
   */
  async getLeastActiveAssignee(eligibleUsers) {
    try {
      // Get lead counts for each user from leads service
      const userIds = eligibleUsers.map(u => u._id);
      const response = await axios.post(`${this.leadsServiceUrl}/api/leads/count-by-users`, {
        userIds,
        status: ['new', 'contacted', 'interested', 'qualified'] // Active statuses
      });

      const leadCounts = response.data.data || {};
      
      // Find user with minimum leads
      let minLeads = Infinity;
      let selectedUser = eligibleUsers[0];

      eligibleUsers.forEach(user => {
        const userLeadCount = leadCounts[user._id] || 0;
        if (userLeadCount < minLeads) {
          minLeads = userLeadCount;
          selectedUser = user;
        }
      });

      return selectedUser;
    } catch (error) {
      console.error('Error in least-active assignment:', error);
      // Fallback to first user
      return eligibleUsers[0];
    }
  }

  /**
   * Random assignment
   */
  getRandomAssignee(eligibleUsers) {
    const randomIndex = Math.floor(Math.random() * eligibleUsers.length);
    return eligibleUsers[randomIndex];
  }

  /**
   * Update assignment tracking in integration
   */
  async updateAssignmentTracking(integrationType, integrationId, userId, eligibleUsers) {
    try {
      let Model;
      
      switch (integrationType.toLowerCase()) {
        case 'website':
          Model = WebsiteIntegration;
          break;
        case 'facebook':
          Model = FacebookIntegration;
          break;
        case 'shopify':
          Model = ShopifyIntegration;
          break;
        default:
          Model = IntegrationConfig;
      }

      const currentSettings = await this.getIntegrationAssignmentSettings(integrationType, integrationId);
      const currentIndex = currentSettings.lastAssignment?.roundRobinIndex || 0;
      const nextIndex = currentIndex >= eligibleUsers.length - 1 ? 0 : currentIndex + 1;

      const updateData = {
        'assignmentSettings.lastAssignment.userId': userId,
        'assignmentSettings.lastAssignment.timestamp': new Date(),
        'assignmentSettings.lastAssignment.roundRobinIndex': nextIndex
      };

      // For IntegrationConfig, use assignmentConfig instead
      if (integrationType.toLowerCase() === 'generic') {
        updateData['assignmentConfig.lastAssignment.userId'] = userId;
        updateData['assignmentConfig.lastAssignment.timestamp'] = new Date();
        updateData['assignmentConfig.lastAssignment.roundRobinIndex'] = nextIndex;
        delete updateData['assignmentSettings.lastAssignment.userId'];
        delete updateData['assignmentSettings.lastAssignment.timestamp'];
        delete updateData['assignmentSettings.lastAssignment.roundRobinIndex'];
      }

      await Model.findByIdAndUpdate(integrationId, updateData);
    } catch (error) {
      console.error('Error updating assignment tracking:', error);
    }
  }

  /**
   * Auto-assign a lead from a specific integration
   */
  async autoAssignLead(leadId, integrationType, integrationId, authToken = null) {
    try {
      const assignmentSettings = await this.getIntegrationAssignmentSettings(integrationType, integrationId);
      
      if (!assignmentSettings.enabled || assignmentSettings.mode === 'manual') {
        return { assigned: false, reason: 'Auto-assignment disabled or manual mode' };
      }

      // Get integration to find organization
      let integration;
      switch (integrationType.toLowerCase()) {
        case 'website':
          integration = await WebsiteIntegration.findById(integrationId);
          break;
        case 'facebook':
          integration = await FacebookIntegration.findById(integrationId);
          break;
        case 'shopify':
          integration = await ShopifyIntegration.findById(integrationId);
          break;
        default:
          integration = await IntegrationConfig.findById(integrationId);
      }

      if (!integration) {
        throw new Error('Integration not found');
      }

      const organizationId = integration.organizationId || integration.companyId;
      
      // For website leads, don't require authToken
      const effectiveAuthToken = integrationType.toLowerCase() === 'website' ? null : authToken;
      const eligibleUsers = await this.getEligibleUsers(organizationId, assignmentSettings, effectiveAuthToken);
      
      if (eligibleUsers.length === 0) {
        return { assigned: false, reason: 'No eligible users found' };
      }

      const assignedUser = await this.getNextAssignee(eligibleUsers, assignmentSettings, integrationType, integrationId);
      
      if (!assignedUser) {
        return { assigned: false, reason: 'Failed to select user' };
      }

      // For website leads, use public API endpoint that doesn't require authentication
      let assignResponse;
      if (integrationType.toLowerCase() === 'website') {
        console.log('Using public API for website lead assignment');
        assignResponse = await axios.put(`${this.leadsServiceUrl}/api/public/leads/${leadId}/assign`, {
          assignedTo: assignedUser._id || assignedUser.userId,
          reason: `auto-assignment-${integrationType}`,
          organizationId: organizationId
        }, {
          headers: {
            'Content-Type': 'application/json',
            'X-Organization-Id': organizationId
          }
        });
      } else {
        // Original auth-based assignment for other sources
        assignResponse = await axios.put(`${this.leadsServiceUrl}/api/leads/${leadId}/assign`, {
          assignedTo: assignedUser._id,
          reason: `auto-assignment-${integrationType}`
        }, {
          headers: { Authorization: authToken }
        });
      }

      return {
        assigned: true,
        assignedTo: assignedUser._id,
        assignedUser: assignedUser,
        algorithm: assignmentSettings.algorithm,
        integration: integrationType
      };
    } catch (error) {
      console.error('Error in auto-assignment:', error);
      return { assigned: false, reason: error.message };
    }
  }

  /**
   * Update assignment settings for an integration
   */
  async updateAssignmentSettings(integrationType, integrationId, newSettings) {
    try {
      let Model;
      let fieldPath = 'assignmentSettings';
      
      switch (integrationType.toLowerCase()) {
        case 'website':
          Model = WebsiteIntegration;
          break;
        case 'facebook':
          Model = FacebookIntegration;
          break;
        case 'shopify':
          Model = ShopifyIntegration;
          break;
        default:
          Model = IntegrationConfig;
          fieldPath = 'assignmentConfig';
      }

      const updateData = {};
      Object.keys(newSettings).forEach(key => {
        updateData[`${fieldPath}.${key}`] = newSettings[key];
      });

      const updated = await Model.findByIdAndUpdate(integrationId, updateData, { new: true });
      return updated;
    } catch (error) {
      console.error('Error updating assignment settings:', error);
      throw error;
    }
  }
}

module.exports = new IntegrationAssignmentService();