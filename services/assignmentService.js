const axios = require('axios');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// Import integration models
const WebsiteIntegration = require('../models/WebsiteIntegration');
const FacebookIntegration = require('../models/FacebookIntegration');
const ShopifyIntegration = require('../models/ShopifyIntegration');
const IntegrationConfig = require('../models/IntegrationConfig');

// UUID pattern for AI agents
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Check if an ID is a UUID (AI agent) or ObjectId (human user)
 */
function isUUID(id) {
  return typeof id === 'string' && UUID_PATTERN.test(id);
}

/**
 * Create a virtual user object for AI agents
 */
function createAIAgentUser(uuid) {
  return {
    _id: uuid,
    userId: uuid,
    name: `AI Agent (${uuid.slice(0, 8)})`,
    email: `ai-agent-${uuid.slice(0, 8)}@system.ai`,
    type: 'ai-agent',
    weight: 1
  };
}

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
      console.log('🔍 Getting assignment settings for:', { integrationType, integrationId });
      
      let integration;
      
      switch (integrationType.toLowerCase()) {
        case 'website':
          integration = await WebsiteIntegration.findById(integrationId);
          console.log('🌐 Website integration found:', !!integration);
          if (integration) {
            console.log('🌐 Website assignment settings:', integration.assignmentSettings);
          }
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
        console.log('❌ Integration not found:', integrationId);
        throw new Error(`Integration not found: ${integrationId}`);
      }

      const settings = integration.assignmentSettings || integration.assignmentConfig || {
        enabled: false,
        mode: 'manual',
        algorithm: 'weighted-round-robin',
        assignToUsers: []
      };

      console.log('✅ Final assignment settings:', settings);
      return settings;
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
        // Process mixed ObjectId/UUID types
        const humanUserIds = [];
        const aiAgentUsers = [];
        
        assignmentSettings.assignToUsers.forEach(user => {
          if (isUUID(user.userId)) {
            // AI Agent - create virtual user
            aiAgentUsers.push({
              ...createAIAgentUser(user.userId),
              weight: user.weight || 1
            });
          } else {
            // Human user - needs auth service lookup
            humanUserIds.push(user.userId);
          }
        });
        
        // Start with AI agents
        eligibleUsers = [...aiAgentUsers];
        
        // Add human users if we have auth token and human user IDs
        if (authToken && humanUserIds.length > 0) {
          try {
            const response = await axios.get(`${this.authServiceUrl}/api/users/by-ids`, {
              headers: { Authorization: authToken },
              params: { ids: humanUserIds.join(','), organizationId }
            });
            
            const humanUsers = (response.data.data || []).map(user => {
              const settingsUser = assignmentSettings.assignToUsers.find(u => 
                u.userId.toString() === user._id.toString()
              );
              return {
                ...user,
                weight: settingsUser ? settingsUser.weight : 1
              };
            });
            
            eligibleUsers = [...eligibleUsers, ...humanUsers];
          } catch (error) {
            console.error('Error fetching human users:', error);
          }
        } else if (!authToken && humanUserIds.length > 0) {
          // For website leads without auth, create virtual users for human IDs too
          const virtualHumanUsers = assignmentSettings.assignToUsers
            .filter(user => !isUUID(user.userId))
            .map(user => ({
              _id: user.userId,
              userId: user.userId,
              weight: user.weight || 1,
              name: 'User',
              email: '',
              type: 'human'
            }));
          
          eligibleUsers = [...eligibleUsers, ...virtualHumanUsers];
        }
        
        console.log('Using mixed assignment:', {
          mode: assignmentSettings.mode,
          totalUsers: eligibleUsers.length,
          aiAgents: aiAgentUsers.length,
          humanUsers: eligibleUsers.length - aiAgentUsers.length
        });
        
        return eligibleUsers;
      } else if (assignmentSettings.mode === 'auto') {
        // For auto mode, check if we have assignToUsers configured
        if (assignmentSettings.assignToUsers && assignmentSettings.assignToUsers.length > 0) {
          // Use same logic as specific mode
          return this.getEligibleUsers(organizationId, { 
            ...assignmentSettings, 
            mode: 'specific' 
          }, authToken);
        }
        
        // Original auto mode logic for auth-based systems
        if (!authToken) {
          console.log('No assignToUsers configured for auto assignment and no auth token');
          return [];
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
      await this.updateAssignmentTracking(integrationType, integrationId, selectedUser._id, eligibleUsers, selectedUser);
    }

    return selectedUser;
  }

  /**
   * Simple round-robin assignment
   */
  async getRoundRobinAssignee(eligibleUsers, assignmentSettings, integrationType, integrationId) {
    const currentIndex = assignmentSettings.lastAssignment?.roundRobinIndex || 0;
    const nextIndex = currentIndex >= eligibleUsers.length - 1 ? 0 : currentIndex + 1;
    
    const selectedUser = eligibleUsers[nextIndex];
    selectedUser._usedRoundRobinIndex = nextIndex; // Store the actual index used
    
    return selectedUser;
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
    
    // Store the weighted list length and USED INDEX for proper index tracking
    const selectedUser = weightedUsers[nextIndex];
    selectedUser._weightedListLength = weightedUsers.length;
    selectedUser._usedRoundRobinIndex = nextIndex; // Store the actual index used
    
    return selectedUser;
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
  async updateAssignmentTracking(integrationType, integrationId, userId, eligibleUsers, selectedUser = null) {
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

      // Use the index that was actually used during selection (if available)
      // This prevents double calculation of nextIndex
      let nextIndex;
      if (selectedUser?._usedRoundRobinIndex !== undefined) {
        // Weighted/regular round-robin: use the index that was already calculated
        nextIndex = selectedUser._usedRoundRobinIndex;
      } else {
        // Fallback for other algorithms: calculate from current settings
        const currentSettings = await this.getIntegrationAssignmentSettings(integrationType, integrationId);
        const currentIndex = currentSettings.lastAssignment?.roundRobinIndex || 0;
        const listLength = eligibleUsers.length;
        nextIndex = currentIndex >= listLength - 1 ? 0 : currentIndex + 1;
      }

      // Handle mixed ObjectId/UUID types - store as is since we're using Mixed type
      const assigneeId = isUUID(userId) ? userId : 
                         (mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId);

      const updateData = {
        'assignmentSettings.lastAssignment.userId': assigneeId,
        'assignmentSettings.lastAssignment.timestamp': new Date(),
        'assignmentSettings.lastAssignment.roundRobinIndex': nextIndex
      };

      // For IntegrationConfig, use assignmentConfig instead
      if (integrationType.toLowerCase() === 'generic') {
        updateData['assignmentConfig.lastAssignment.userId'] = assigneeId;
        updateData['assignmentConfig.lastAssignment.timestamp'] = new Date();
        updateData['assignmentConfig.lastAssignment.roundRobinIndex'] = nextIndex;
        delete updateData['assignmentSettings.lastAssignment.userId'];
        delete updateData['assignmentSettings.lastAssignment.timestamp'];
        delete updateData['assignmentSettings.lastAssignment.roundRobinIndex'];
      }

      await Model.findByIdAndUpdate(integrationId, updateData);
      
      console.log('Updated assignment tracking:', {
        integrationType,
        integrationId,
        assigneeId,
        assigneeType: isUUID(userId) ? 'AI Agent' : 'Human User',
        currentIndex,
        nextIndex,
        listLength
      });
    } catch (error) {
      console.error('Error updating assignment tracking:', error);
    }
  }

  /**
   * Auto-assign a lead from a specific integration
   */
  async autoAssignLead(leadId, integrationType, integrationId, authToken = null) {
    try {
      console.log('🔄 Auto-assignment debug:', {
        leadId,
        integrationType,
        integrationId,
        hasAuthToken: !!authToken
      });

      const assignmentSettings = await this.getIntegrationAssignmentSettings(integrationType, integrationId);
      
      console.log('📋 Assignment settings retrieved:', {
        enabled: assignmentSettings.enabled,
        mode: assignmentSettings.mode,
        algorithm: assignmentSettings.algorithm,
        userCount: assignmentSettings.assignToUsers?.length || 0
      });
      
      if (!assignmentSettings.enabled || assignmentSettings.mode === 'manual') {
        console.log('❌ Auto-assignment disabled or manual mode');
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
          },
          timeout: 30000, // 30 second timeout
          maxRetries: 2
        });
      } else {
        // Original auth-based assignment for other sources
        assignResponse = await axios.put(`${this.leadsServiceUrl}/api/leads/${leadId}/assign`, {
          assignedTo: assignedUser._id,
          reason: `auto-assignment-${integrationType}`
        }, {
          headers: { Authorization: authToken },
          timeout: 30000 // 30 second timeout
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