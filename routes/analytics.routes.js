const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const authMiddleware = require('../middleware/auth');
const { requireIntegrationAccess } = require('../middleware/permissions');
const { dateFilter } = require('../middleware/dateFilter');

// All analytics routes require authentication
router.use(authMiddleware.authenticateUser);

// Get integration status for user/organization (requires manage_integrations permission)
// Supports start_date and end_date query parameters
router.get('/status', 
  requireIntegrationAccess(),
  dateFilter,
  analyticsController.getIntegrationsStatus
);

module.exports = router;