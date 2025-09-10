const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Generic request validation middleware
const validateRequest = (requiredFields = []) => {
  return (req, res, next) => {
    const errors = [];
    
    // Check for required fields
    for (const field of requiredFields) {
      if (req.body[field] === undefined || req.body[field] === null || req.body[field] === '') {
        errors.push({
          field,
          message: `${field} is required`
        });
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    next();
  };
};

// Email validation
const validateEmail = body('email')
  .isEmail()
  .normalizeEmail()
  .withMessage('Please provide a valid email address');

// Phone validation (optional)
const validatePhone = body('phone')
  .optional()
  .isMobilePhone()
  .withMessage('Please provide a valid phone number');

// URL validation
const validateURL = (field) => body(field)
  .isURL()
  .withMessage(`${field} must be a valid URL`);

// Domain validation
const validateDomain = body('domain')
  .matches(/^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/i)
  .withMessage('Please provide a valid domain name');

// Facebook form validation
const validateFacebookForm = [
  body('leadSettings.defaultStatus')
    .isIn(['new', 'contacted', 'qualified', 'unqualified'])
    .withMessage('Invalid lead status'),
  body('syncSettings.autoSync')
    .isBoolean()
    .withMessage('Auto sync must be true or false'),
  body('syncSettings.syncInterval')
    .optional()
    .isInt({ min: 5, max: 1440 })
    .withMessage('Sync interval must be between 5 and 1440 minutes')
];

// Website form validation
const validateWebsiteForm = [
  validateDomain,
  body('formConfig.fields')
    .isArray({ min: 1 })
    .withMessage('At least one form field is required'),
  body('formConfig.fields.*.name')
    .notEmpty()
    .withMessage('Field name is required'),
  body('formConfig.fields.*.type')
    .isIn(['text', 'email', 'phone', 'textarea', 'select', 'checkbox'])
    .withMessage('Invalid field type'),
  body('appearance.primaryColor')
    .optional()
    .matches(/^#[0-9A-F]{6}$/i)
    .withMessage('Primary color must be a valid hex color'),
  body('security.domainWhitelist')
    .optional()
    .isArray()
    .withMessage('Domain whitelist must be an array')
];

// Shopify form validation
const validateShopifyForm = [
  body('shop')
    .matches(/^[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9]$/)
    .withMessage('Invalid shop name format'),
  body('syncSettings.syncCustomers')
    .optional()
    .isBoolean()
    .withMessage('Sync customers must be true or false'),
  body('syncSettings.syncOrders')
    .optional()
    .isBoolean()
    .withMessage('Sync orders must be true or false')
];

// AI Agent form validation
const validateAIAgentForm = [
  body('name')
    .isLength({ min: 1, max: 100 })
    .withMessage('Agent name must be between 1 and 100 characters'),
  body('platforms')
    .isArray({ min: 1 })
    .withMessage('At least one platform is required'),
  body('platforms.*')
    .isIn(['website', 'whatsapp', 'messenger', 'telegram', 'instagram', 'livechat'])
    .withMessage('Invalid platform'),
  body('config.personality.context')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Personality context must be less than 1000 characters'),
  body('config.leadSettings.defaultStatus')
    .optional()
    .isIn(['new', 'contacted', 'qualified', 'unqualified'])
    .withMessage('Invalid default lead status')
];

// Chat message validation
const validateChatMessage = [
  body('message')
    .notEmpty()
    .isLength({ max: 1000 })
    .withMessage('Message is required and must be less than 1000 characters'),
  body('sessionId')
    .notEmpty()
    .withMessage('Session ID is required'),
  body('platform')
    .optional()
    .isIn(['website', 'whatsapp', 'messenger', 'telegram', 'instagram'])
    .withMessage('Invalid platform')
];

// Lead capture validation
const validateLeadCapture = [
  body('name')
    .notEmpty()
    .isLength({ min: 1, max: 100 })
    .withMessage('Name is required and must be less than 100 characters'),
  validateEmail,
  validatePhone,
  body('sessionId')
    .notEmpty()
    .withMessage('Session ID is required')
];

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    logger.warn('Validation errors:', errors.array());
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  
  next();
};

// Sanitize input data
const sanitizeInput = (req, res, next) => {
  // Remove any potential XSS attempts
  const sanitizeObject = (obj) => {
    if (typeof obj !== 'object' || obj === null) return obj;
    
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        // Basic XSS prevention
        obj[key] = obj[key]
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/javascript:/gi, '')
          .replace(/on\w+\s*=/gi, '');
      } else if (typeof obj[key] === 'object') {
        sanitizeObject(obj[key]);
      }
    }
    return obj;
  };

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  next();
};

module.exports = {
  validateRequest,
  validateEmail,
  validatePhone,
  validateURL,
  validateDomain,
  validateFacebookForm,
  validateWebsiteForm,
  validateShopifyForm,
  validateAIAgentForm,
  validateChatMessage,
  validateLeadCapture,
  handleValidationErrors,
  sanitizeInput
};
