const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const authMiddleware = require('../middleware/auth');
const { requireIntegrationAccess } = require('../middleware/permissions');

// All analytics routes require authentication
router.use(authMiddleware.authenticateUser);

// Get integration status for user/organization (requires manage_integrations permission)
router.get('/status', 
  requireIntegrationAccess(), 
  analyticsController.getIntegrationsStatus
);

module.exports = router;