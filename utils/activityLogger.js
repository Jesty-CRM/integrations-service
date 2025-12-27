const axios = require('axios');
const logger = require('./logger');

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3000';
const SERVICE_AUTH_SECRET = process.env.SERVICE_AUTH_SECRET;

/**
 * Activity Logger Utility for Integrations Service
 * Logs user activities to auth-service
 */
class ActivityLogger {
  /**
   * Log activity to auth-service
   * @param {Object} activityData - Activity data
   * @returns {Promise<Object>} Result
   */
  async log(activityData) {
    try {
      // Validate required fields
      if (!activityData.userId || !activityData.organizationId || !activityData.activityType || !activityData.description) {
        throw new Error('Missing required activity fields: userId, organizationId, activityType, description');
      }

      const response = await axios.post(
        `${AUTH_SERVICE_URL}/api/activities/log`,
        activityData,
        {
          headers: {
            'X-Service-Auth': SERVICE_AUTH_SECRET,
            'Content-Type': 'application/json'
          },
          timeout: 5000
        }
      );

      return response.data;
    } catch (error) {
      // Don't throw error to avoid breaking main operations
      logger.error('Failed to log activity:', {
        error: error.message,
        activityType: activityData.activityType
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Log lead imported activity from integrations
   */
  async logLeadImported(userId, userName, organizationId, leadCount, source) {
    return this.log({
      userId,
      userName,
      organizationId,
      activityType: 'lead_imported',
      category: 'lead',
      targetType: 'lead',
      description: `Imported ${leadCount} lead(s) from ${source}`,
      metadata: {
        recordCount: leadCount,
        leadSource: source
      }
    });
  }

  /**
   * Log integration connected activity
   */
  async logIntegrationConnected(userId, userName, organizationId, integrationType, integrationName) {
    return this.log({
      userId,
      userName,
      organizationId,
      activityType: 'integration_connected',
      category: 'integration',
      targetType: 'integration',
      targetName: integrationName,
      description: `Connected ${integrationType} integration: ${integrationName}`,
      metadata: {
        integrationType,
        integrationName
      }
    });
  }

  /**
   * Log integration disconnected activity
   */
  async logIntegrationDisconnected(userId, userName, organizationId, integrationType, integrationName) {
    return this.log({
      userId,
      userName,
      organizationId,
      activityType: 'integration_disconnected',
      category: 'integration',
      targetType: 'integration',
      targetName: integrationName,
      description: `Disconnected ${integrationType} integration: ${integrationName}`,
      metadata: {
        integrationType,
        integrationName
      }
    });
  }

  /**
   * Log integration synced activity
   */
  async logIntegrationSynced(userId, userName, organizationId, integrationType, integrationName, recordCount) {
    return this.log({
      userId,
      userName,
      organizationId,
      activityType: 'integration_synced',
      category: 'integration',
      targetType: 'integration',
      targetName: integrationName,
      description: `Synced ${recordCount} record(s) from ${integrationType} integration: ${integrationName}`,
      metadata: {
        integrationType,
        integrationName,
        recordCount
      }
    });
  }

  /**
   * Log integration error activity
   */
  async logIntegrationError(userId, userName, organizationId, integrationType, integrationName, errorMessage) {
    return this.log({
      userId,
      userName,
      organizationId,
      activityType: 'integration_error',
      category: 'integration',
      targetType: 'integration',
      targetName: integrationName,
      description: `Integration error in ${integrationType}: ${errorMessage}`,
      metadata: {
        integrationType,
        integrationName,
        errorMessage: errorMessage?.substring(0, 200)
      }
    });
  }
}

module.exports = new ActivityLogger();
