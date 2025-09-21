const jwt = require('jsonwebtoken');
const axios = require('axios');
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

    // Verify the token using the same secret as auth service
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    
    // If token is valid, we need to get user details from auth service
    try {
      const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3002';
      const response = await axios.get(`${authServiceUrl}/api/auth/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        req.user = {
          id: response.data.user._id,
          email: response.data.user.email,
          name: response.data.user.name,
          organizationId: response.data.user.organizationId,
          roles: response.data.user.roles
        };
        next();
      } else {
        return res.status(401).json({
          success: false,
          message: 'Invalid token.'
        });
      }
    } catch (authError) {
      logger.error('Auth service call failed:', authError.message);
      return res.status(401).json({
        success: false,
        message: 'Authentication failed.'
      });
    }
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

    // Check if user has any of the required roles
    const userRoles = req.user.roles || [];
    const hasRequiredRole = roles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
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
