const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { authenticateServiceJWT } = require('../middleware/auth');

// DELETE /api/admin/delete-organization-data/:organizationId - Delete all integration data for organization (Service-to-Service only)
router.delete('/delete-organization-data/:organizationId',
  authenticateServiceJWT,
  adminController.deleteOrganizationData
);

module.exports = router;