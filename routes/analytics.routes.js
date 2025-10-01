const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics.controller');

// Get integration status for user/organization
router.get('/status', analyticsController.getIntegrationsStatus);

module.exports = router;