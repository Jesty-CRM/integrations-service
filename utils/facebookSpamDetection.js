const logger = require('./logger');

/**
 * Facebook Lead Spam Detection Utility
 * DISABLED - All leads are accepted
 */
class FacebookSpamDetection {
  /**
   * Check if a Facebook lead is spam
   * @param {Object} leadData - Facebook lead data
   * @returns {Object} - Spam detection result
   */
  detectFacebookSpam(leadData) {
    // Spam detection disabled - accept all leads
    return {
      isSpam: false,
      spamScore: 0,
      spamIndicators: [],
      action: 'allow',
      reason: 'Spam detection disabled - all leads accepted'
    };
  }

  /**
   * Log Facebook spam detection
   */
  logFacebookSpamDetection(leadData, detectionResult, context = {}) {
    logger.debug('✅ Facebook lead accepted (spam detection disabled):', {
      email: leadData.email,
      name: leadData.name,
      leadgenId: leadData.leadgenId,
      organizationId: context.organizationId
    });
  }
}

module.exports = new FacebookSpamDetection();