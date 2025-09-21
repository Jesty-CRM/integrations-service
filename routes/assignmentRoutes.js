const express = require('express');
const router = express.Router();
const assignmentController = require('../controllers/assignmentController');
const { authenticateUser, authorizeRoles } = require('../middleware/auth');

// Apply authentication to all routes
router.use(authenticateUser);

/**
 * Assignment Settings Routes
 */

// GET /api/assignments/:integrationType/:integrationId/settings - Get assignment settings
router.get('/:integrationType/:integrationId/settings',
  authorizeRoles('admin', 'manager'),
  assignmentController.getAssignmentSettings
);

// PUT /api/assignments/:integrationType/:integrationId/settings - Update assignment settings
router.put('/:integrationType/:integrationId/settings',
  authorizeRoles('admin', 'manager'),
  assignmentController.updateAssignmentSettings
);

// GET /api/assignments/:integrationType/:integrationId/eligible-users - Get eligible users
router.get('/:integrationType/:integrationId/eligible-users',
  authorizeRoles('admin', 'manager'),
  assignmentController.getEligibleUsers
);

// GET /api/assignments/:integrationType/:integrationId/preview - Preview next assignment
router.get('/:integrationType/:integrationId/preview',
  authorizeRoles('admin', 'manager'),
  assignmentController.previewNextAssignment
);

// POST /api/assignments/:integrationType/:integrationId/assign - Manually assign a lead
router.post('/:integrationType/:integrationId/assign',
  authorizeRoles('admin', 'manager'),
  assignmentController.assignLead
);

// GET /api/assignments/:integrationType/:integrationId/stats - Get assignment statistics
router.get('/:integrationType/:integrationId/stats',
  authorizeRoles('admin', 'manager'),
  assignmentController.getAssignmentStats
);

// POST /api/assignments/:integrationType/:integrationId/reset - Reset assignment tracking
router.post('/:integrationType/:integrationId/reset',
  authorizeRoles('admin'),
  assignmentController.resetAssignmentTracking
);

module.exports = router;