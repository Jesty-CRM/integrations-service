const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');
const authMiddleware = require('../middleware/auth');

// All analytics routes require authentication
router.use(authMiddleware.authenticateUser);

// Get integration status for user/organization
router.get('/status', analyticsController.getIntegrationsStatus);

module.exports = router;