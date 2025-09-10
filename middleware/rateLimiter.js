const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// General rate limiter for API endpoints
const rateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  }
});

// Strict rate limiter for form submissions and webhooks
const strictRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // Limit each IP to 20 requests per 5 minutes
  message: {
    success: false,
    message: 'Too many form submissions, please try again later.',
    retryAfter: '5 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Strict rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many form submissions, please try again later.',
      retryAfter: '5 minutes'
    });
  }
});

// Chat rate limiter (more lenient for chat interactions)
const chatRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 chat messages per minute
  message: {
    success: false,
    message: 'Too many chat messages, please slow down.',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Chat rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Too many chat messages, please slow down.',
      retryAfter: '1 minute'
    });
  }
});

// Webhook rate limiter (very lenient as webhooks come from external services)
const webhookRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 webhook requests per minute
  message: {
    success: false,
    message: 'Webhook rate limit exceeded',
    retryAfter: '1 minute'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for known webhook IPs (Facebook, Shopify, etc.)
    const trustedIPs = [
      '173.252.74.0/24', // Facebook IP range
      '31.13.24.0/21',   // Facebook IP range
      '23.227.38.0/24'   // Shopify IP range
    ];
    
    // Note: In production, implement proper IP range checking
    return false; // For now, apply rate limiting to all
  },
  handler: (req, res) => {
    logger.warn(`Webhook rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Webhook rate limit exceeded',
      retryAfter: '1 minute'
    });
  }
});

// API key based rate limiter
const createAPIKeyRateLimiter = (windowMs = 15 * 60 * 1000, max = 1000) => {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => {
      // Use API key instead of IP for rate limiting
      return req.get('X-API-Key') || req.query.apiKey || req.ip;
    },
    message: {
      success: false,
      message: 'API rate limit exceeded for this key',
      retryAfter: Math.floor(windowMs / 60000) + ' minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const apiKey = req.get('X-API-Key') || req.query.apiKey;
      logger.warn(`API rate limit exceeded for key: ${apiKey?.substring(0, 10)}...`);
      res.status(429).json({
        success: false,
        message: 'API rate limit exceeded for this key',
        retryAfter: Math.floor(windowMs / 60000) + ' minutes'
      });
    }
  });
};

// Organization-based rate limiter
const createOrganizationRateLimiter = (windowMs = 15 * 60 * 1000, max = 5000) => {
  return rateLimit({
    windowMs,
    max,
    keyGenerator: (req) => {
      // Use organization ID for rate limiting
      return req.user?.organizationId || req.ip;
    },
    message: {
      success: false,
      message: 'Organization rate limit exceeded',
      retryAfter: Math.floor(windowMs / 60000) + ' minutes'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn(`Organization rate limit exceeded for org: ${req.user?.organizationId}`);
      res.status(429).json({
        success: false,
        message: 'Organization rate limit exceeded',
        retryAfter: Math.floor(windowMs / 60000) + ' minutes'
      });
    }
  });
};

module.exports = {
  rateLimiter,
  strictRateLimiter,
  chatRateLimiter,
  webhookRateLimiter,
  createAPIKeyRateLimiter,
  createOrganizationRateLimiter
};
