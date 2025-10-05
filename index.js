const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

// Initialize Express app
const app = express();

// Trust proxy for X-Forwarded-For headers (needed for webhooks)
// Only trust the first proxy (more secure than 'true')
app.set('trust proxy', 1);

// Console-only logger with proper formatting
const logger = {
  info: (message) => console.log(`\x1b[32m[INFO]\x1b[0m ${new Date().toISOString()} - ${message}`),
  error: (message) => console.error(`\x1b[31m[ERROR]\x1b[0m ${new Date().toISOString()} - ${message}`),
  warn: (message) => console.warn(`\x1b[33m[WARN]\x1b[0m ${new Date().toISOString()} - ${message}`),
  debug: (message) => console.log(`\x1b[36m[DEBUG]\x1b[0m ${new Date().toISOString()} - ${message}`)
};

// Security middleware
app.use(helmet());
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting (more lenient for webhooks)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit for webhook traffic
  message: 'Too many requests from this IP, please try again later.',
  trustProxy: false, // Use express app's trust proxy setting
  skip: (req) => {
    // Skip rate limiting for webhook endpoints
    return req.path.startsWith('/api/webhooks/');
  }
});
app.use(limiter);

// Body parsing middleware
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'integrations-service',
    timestamp: new Date().toISOString()
  });
});

// Import routes
const integrationsRoutes = require('./routes/integrations.routes');
const webhooksRoutes = require('./routes/webhooks.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const websiteRoutes = require('./controllers/website.controller'); // This is actually a router
const facebookRoutes = require('./controllers/facebook.controller'); // Facebook controller
const shopifyRoutes = require('./routes/shopifyRoutes'); // Shopify routes
const shopifyWebhookRoutes = require('./routes/shopifyWebhookRoutes'); // Shopify webhook management
const webhookManagement = require('./routes/webhookManagementDB'); // Database-enabled webhook management
const wordpressRoutes = require('./routes/wordpressRoutes'); // WordPress routes
const formAssignmentRoutes = require('./routes/formAssignmentRoutes'); // Form-level assignment routes

// Use routes - Mount Facebook routes FIRST to avoid auth conflicts
app.use('/api/integrations/facebook', facebookRoutes); // Facebook routes (OAuth callback needs to be first)
app.use('/api/integrations/shopify', shopifyRoutes); // Shopify routes
app.use('/api/integrations/wordpress', wordpressRoutes); // WordPress routes
app.use('/api/integrations/analytics', analyticsRoutes); // Analytics routes
app.use('/api/shopify', shopifyWebhookRoutes); // Shopify webhook management routes
app.use('/api/webhooks', webhookManagement); // Simple webhook CRUD
app.use('/api/integrations/website', websiteRoutes);
app.use('/api/integrations', integrationsRoutes); // General integrations routes with auth
app.use('/api/integrations', formAssignmentRoutes); // Form-level assignment routes
app.use('/api/webhooks', webhooksRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jesty_integrations')
  .then(() => {
    logger.info('Connected to MongoDB');
  })
  .catch((err) => {
    logger.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    mongoose.connection.close(() => {
      logger.info('MongoDB connection closed');
      process.exit(0);
    });
  });
});

const PORT = process.env.PORT || 3005;

const server = app.listen(PORT, () => {
  logger.info(`Integrations service running on port ${PORT}`);
});

module.exports = app;
