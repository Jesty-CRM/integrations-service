const jwt = require('jsonwebtoken');
const logger = require('../utils/logger');

// Authenticate user with JWT token
const authenticateUser = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.error('Authentication error:', error.message);
    res.status(401).json({
      success: false,
      message: 'Invalid token.'
    });
  }
};

// Authenticate service-to-service calls
const authenticateService = (req, res, next) => {
  try {
    const serviceToken = req.header('X-Service-Auth');
    
    if (!serviceToken || serviceToken !== process.env.SERVICE_AUTH_TOKEN) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized service call'
      });
    }

    next();
  } catch (error) {
    logger.error('Service authentication error:', error.message);
    res.status(401).json({
      success: false,
      message: 'Service authentication failed'
    });
  }
};

// Authenticate API key for public endpoints
const authenticateAPIKey = async (req, res, next) => {
  try {
    const apiKey = req.header('X-API-Key') || req.query.apiKey;
    
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: 'API key required'
      });
    }

    // Validate API key format
    if (!apiKey.startsWith('website_') && !apiKey.startsWith('agent_')) {
      return res.status(401).json({
        success: false,
        message: 'Invalid API key format'
      });
    }

    // API key validation would happen in the specific controllers
    // as they need to check against their respective models
    req.apiKey = apiKey;
    next();
  } catch (error) {
    logger.error('API key authentication error:', error.message);
    res.status(401).json({
      success: false,
      message: 'API key authentication failed'
    });
  }
};

// Authorization middleware for role-based access
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. Authentication required.'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Insufficient permissions.'
      });
    }

    next();
  };
};

// Organization ownership validation
const validateOrganization = async (req, res, next) => {
  try {
    const { organizationId } = req.params;
    
    if (organizationId && req.user.organizationId !== organizationId) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Invalid organization.'
      });
    }

    next();
  } catch (error) {
    logger.error('Organization validation error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Organization validation failed'
    });
  }
};

module.exports = {
  authenticateUser,
  authenticateService,
  authenticateAPIKey,
  authorizeRoles,
  validateOrganization
};
