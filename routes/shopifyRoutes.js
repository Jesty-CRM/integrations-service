const express = require('express');
const router = express.Router();
const shopifyController = require('../controllers/shopifyController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

// Public webhook endpoint (no authentication required)
router.post('/webhook/:organizationId', 
  express.raw({ type: 'application/json' }),
  shopifyController.handleWebhook
);

// Apply authentication to other routes
router.use(authenticateUser);

// POST /api/integrations/shopify/setup - Create/update Shopify integration
router.post('/setup',
  authorizeRoles('admin', 'user'),
  shopifyController.createIntegration
);

// GET /api/integrations/shopify/integration - Get integration details
router.get('/integration',
  authorizeRoles('admin', 'user'),
  shopifyController.getIntegration
);

// PUT /api/integrations/shopify/integration - Update integration settings
router.put('/integration',
  authorizeRoles('admin', 'user'),
  shopifyController.updateIntegration
);

// DELETE /api/integrations/shopify/integration - Delete integration
router.delete('/integration',
  authorizeRoles('admin'),
  shopifyController.deleteIntegration
);

// GET /api/integrations/shopify/instructions - Get setup instructions
router.get('/instructions',
  authorizeRoles('admin', 'user'),
  shopifyController.getSetupInstructions
);

// POST /api/integrations/shopify/test - Test webhook processing
router.post('/test',
  authorizeRoles('admin', 'user'),
  shopifyController.testWebhook
);

// GET /api/integrations/shopify/stats - Get integration statistics
router.get('/stats',
  authorizeRoles('admin', 'user'),
  shopifyController.getStatistics
);

module.exports = router;