const logger = require('./logger');

/**
 * Facebook Lead Spam Detection Utility
 * Detects and prevents spam leads from Facebook webhooks before they reach the CRM
 */
class FacebookSpamDetection {
  constructor() {
    // Facebook-specific spam patterns
    this.facebookSpamPatterns = {
      email: [
        /^lead_\d+@facebook\.com$/i,
        /^test_lead_\d+@.*$/i,
        /^dummy_\d+@.*$/i,
        /^fake_\d+@.*$/i,
        /^spam_\d+@.*$/i,
        /^bot_\d+@.*$/i,
        /^automated_\d+@.*$/i,
        /^noreply@facebook\.com$/i,
        /^no-reply@facebook\.com$/i,
        /^facebook_test@.*$/i,
        /@example\.com$/i,
        /@test\.com$/i,
        /@spam\.com$/i,
        /@fake\.com$/i,
        /@dummy\.com$/i,
        /@invalid\.com$/i,
        /^.*\.fb\.com$/i  // Facebook test domains
      ],

      phone: [
        /^\+1234567890$/,
        /^\+1111111111$/,
        /^\+0000000000$/,
        /^1234567890$/,
        /^0000000000$/,
        /^1111111111$/,
        /^\+1?(555|123|000|111|999)\d{7}$/,
        /^\+91\d{10}$/ // Common test Indian numbers
      ],

      name: [
        /^test\s*lead$/i,
        /^facebook\s*lead$/i,
        /^dummy\s*lead$/i,
        /^fake\s*lead$/i,
        /^spam\s*lead$/i,
        /^bot\s*lead$/i,
        /^lead\s*\d+$/i,
        /^test\s*user$/i,
        /^facebook\s*test$/i,
        /^automated\s*test$/i,
        /^quality\s*assurance$/i,
        /^qa\s*test$/i,
        /^test\s*assignment\s*user$/i
      ],

      leadgenId: [
        /^test_/i,
        /^dummy_/i,
        /^fake_/i,
        /^spam_/i,
        /^bot_/i
      ],

      formName: [
        /test\s*form/i,
        /qa\s*form/i,
        /dummy\s*form/i,
        /fake\s*form/i,
        /spam\s*form/i,
        /bot\s*form/i
      ]
    };

    // Common Facebook test values
    this.facebookTestValues = [
      'Test Assignment User',
      'Facebook Test User',
      'Test User',
      'QA Test',
      'Quality Assurance'
    ];
  }

  /**
   * Check if a Facebook lead is spam
   * @param {Object} leadData - Facebook lead data
   * @returns {Object} - Spam detection result
   */
  detectFacebookSpam(leadData) {
    const spamIndicators = [];
    let spamScore = 0;
    let isSpam = false;

    const { 
      name, 
      email, 
      phone, 
      leadgenId, 
      formName, 
      extractedFields = {},
      sourceData = {}
    } = leadData;

    // Check Facebook leadgen ID patterns
    if (leadgenId) {
      for (const pattern of this.facebookSpamPatterns.leadgenId) {
        if (pattern.test(leadgenId)) {
          spamIndicators.push(`Spam leadgen ID pattern: ${leadgenId}`);
          spamScore += 100;
          isSpam = true;
          break;
        }
      }
    }

    // Check email patterns (Facebook-specific)
    if (email) {
      for (const pattern of this.facebookSpamPatterns.email) {
        if (pattern.test(email)) {
          spamIndicators.push(`Facebook spam email: ${email}`);
          spamScore += 100;
          isSpam = true;
          break;
        }
      }
    }

    // Check phone patterns
    if (phone) {
      const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
      for (const pattern of this.facebookSpamPatterns.phone) {
        if (pattern.test(cleanPhone)) {
          spamIndicators.push(`Spam phone pattern: ${phone}`);
          spamScore += 80;
          isSpam = true;
          break;
        }
      }
    }

    // Check name patterns
    if (name) {
      for (const pattern of this.facebookSpamPatterns.name) {
        if (pattern.test(name)) {
          spamIndicators.push(`Spam name pattern: ${name}`);
          spamScore += 90;
          isSpam = true;
          break;
        }
      }

      // Check against known Facebook test values
      if (this.facebookTestValues.some(testVal => 
        name.toLowerCase().includes(testVal.toLowerCase()))) {
        spamIndicators.push(`Facebook test user name: ${name}`);
        spamScore += 95;
        isSpam = true;
      }
    }

    // Check form name if available
    if (formName) {
      for (const pattern of this.facebookSpamPatterns.formName) {
        if (pattern.test(formName)) {
          spamIndicators.push(`Suspicious form name: ${formName}`);
          spamScore += 40;
        }
      }
    }

    // Check extracted custom fields for spam content
    if (extractedFields.customFields) {
      const customFieldsCheck = this.checkCustomFieldsSpam(extractedFields.customFields);
      if (customFieldsCheck.isSpam) {
        spamIndicators.push(`Spam in custom fields: ${customFieldsCheck.reason}`);
        spamScore += customFieldsCheck.score;
      }
    }

    // Facebook-specific test lead indicators
    if (this.isFacebookTestLead(leadData)) {
      spamIndicators.push('Facebook test lead detected');
      spamScore += 100;
      isSpam = true;
    }

    // High spam score threshold
    if (spamScore >= 70 && !isSpam) {
      isSpam = true;
    }

    return {
      isSpam,
      spamScore,
      spamIndicators,
      action: isSpam ? 'block' : 'allow',
      reason: isSpam ? `Facebook spam detected (score: ${spamScore}): ${spamIndicators.join(', ')}` : 'Passed Facebook spam checks'
    };
  }

  /**
   * Check if this is a Facebook test lead
   */
  isFacebookTestLead(leadData) {
    const { leadgenId, email, name, phone, sourceData = {} } = leadData;

    // Test leadgen IDs
    if (leadgenId && leadgenId.startsWith('test_')) {
      return true;
    }

    // Classic Facebook test email pattern
    if (email && /^lead_\d+@facebook\.com$/i.test(email)) {
      return true;
    }

    // Test phone with test email combination
    if (phone === '+919876543210' && email && email.includes('test')) {
      return true;
    }

    // Test assignment user pattern (common in Facebook test webhooks)
    if (name && name.includes('Test Assignment') && email && email.includes('.fb.com')) {
      return true;
    }

    return false;
  }

  /**
   * Check custom fields for spam content
   */
  checkCustomFieldsSpam(customFields) {
    let spamScore = 0;
    const reasons = [];

    const spamWords = ['test', 'dummy', 'fake', 'spam', 'bot', 'automated'];

    for (const [key, value] of Object.entries(customFields)) {
      if (typeof value === 'string') {
        const lowerValue = value.toLowerCase();
        
        const spamWordsFound = spamWords.filter(word => 
          lowerValue.includes(word.toLowerCase())
        );
        
        if (spamWordsFound.length > 0) {
          reasons.push(`${key}: ${spamWordsFound.join(', ')}`);
          spamScore += spamWordsFound.length * 10;
        }
      }
    }

    return {
      isSpam: spamScore > 20,
      score: spamScore,
      reason: reasons.join('; ')
    };
  }

  /**
   * Log Facebook spam detection
   */
  logFacebookSpamDetection(leadData, detectionResult, context = {}) {
    if (detectionResult.isSpam) {
      logger.warn('🚫 Facebook spam lead blocked at integration service:', {
        email: leadData.email,
        name: leadData.name,
        phone: leadData.phone,
        leadgenId: leadData.leadgenId,
        formName: leadData.formName,
        spamScore: detectionResult.spamScore,
        reasons: detectionResult.spamIndicators,
        organizationId: context.organizationId,
        integrationId: context.integrationId,
        pageId: context.pageId,
        formId: context.formId
      });
    } else {
      logger.debug('✅ Facebook lead passed spam detection:', {
        email: leadData.email,
        name: leadData.name,
        leadgenId: leadData.leadgenId,
        spamScore: detectionResult.spamScore,
        organizationId: context.organizationId
      });
    }
  }

  /**
   * Get spam detection statistics
   */
  getStats() {
    return {
      emailPatterns: this.facebookSpamPatterns.email.length,
      phonePatterns: this.facebookSpamPatterns.phone.length,
      namePatterns: this.facebookSpamPatterns.name.length,
      leadgenIdPatterns: this.facebookSpamPatterns.leadgenId.length,
      formNamePatterns: this.facebookSpamPatterns.formName.length,
      testValues: this.facebookTestValues.length
    };
  }

  /**
   * Add custom spam pattern
   */
  addSpamPattern(type, pattern) {
    if (this.facebookSpamPatterns[type]) {
      const regexPattern = new RegExp(pattern, 'i');
      this.facebookSpamPatterns[type].push(regexPattern);
      logger.info(`Added Facebook spam pattern (${type}):`, pattern);
      return true;
    }
    return false;
  }
}

module.exports = new FacebookSpamDetection();