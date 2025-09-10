const express = require('express');
const router = express.Router();
const integrationsController = require('../controllers/integrations.controller');
const authMiddleware = require('../middleware/auth.middleware');
const validation = require('../middleware/validation.middleware');

// All routes require authentication
router.use(authMiddleware.authenticate);

/**
 * @route   GET /api/integrations
 * @desc    Get all integrations for company
 * @access  Private
 */
router.get('/', integrationsController.getIntegrations);

/**
 * @route   GET /api/integrations/:provider
 * @desc    Get specific integration by provider
 * @access  Private
 */
router.get('/:provider', 
  validation.validateProvider,
  integrationsController.getIntegration
);

/**
 * @route   POST /api/integrations
 * @desc    Create or update integration
 * @access  Private
 */
router.post('/',
  validation.validateIntegrationCreate,
  integrationsController.createIntegration
);

/**
 * @route   POST /api/integrations/:provider/test
 * @desc    Test integration connection
 * @access  Private
 */
router.post('/:provider/test',
  validation.validateProvider,
  integrationsController.testIntegration
);

/**
 * @route   POST /api/integrations/:provider/sync
 * @desc    Sync data from integration
 * @access  Private
 */
router.post('/:provider/sync',
  validation.validateProvider,
  validation.validateSyncRequest,
  integrationsController.syncIntegration
);

/**
 * @route   PUT /api/integrations/:provider/disable
 * @desc    Disable integration
 * @access  Private
 */
router.put('/:provider/disable',
  validation.validateProvider,
  integrationsController.disableIntegration
);

/**
 * @route   DELETE /api/integrations/:provider
 * @desc    Delete integration
 * @access  Private
 */
router.delete('/:provider',
  validation.validateProvider,
  integrationsController.deleteIntegration
);

/**
 * @route   GET /api/integrations/:provider/logs
 * @desc    Get integration logs
 * @access  Private
 */
router.get('/:provider/logs',
  validation.validateProvider,
  integrationsController.getIntegrationLogs
);

module.exports = router;
