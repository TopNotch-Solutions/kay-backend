const router = require('express').Router();
const adminController = require('../controllers/admin.controller');
const adminBillingFeesController = require('../controllers/adminBillingFees.controller');
const adminPatientRecordsController = require('../controllers/adminPatientRecords.controller');
const { authenticate } = require('../middleware/auth');
const { authorize, allowRoles } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

router.use(authenticate);

// Admin dashboard
router.get('/dashboard', allowRoles('system_admin'), adminController.getDashboard);

// Facility (read-only list for employee assignment — create is blocked in controller)
router.get('/facilities', authorize('facility', 'read'), adminController.getFacilities);
router.post('/facilities', authorize('facility', 'create'), auditMiddleware('facility'), adminController.createFacility);
router.get('/clinic-departments/catalog', authorize('facility', 'read'), adminController.getClinicDepartmentCatalog);
router.get('/facilities/:id/departments', authorize('facility', 'read'), adminController.getFacilityDepartments);

router.get(
  '/billing-prices/national/history',
  allowRoles('system_admin'),
  adminBillingFeesController.getNationalBillingFeeHistory
);
router.get(
  '/billing-prices/national',
  allowRoles('system_admin'),
  adminBillingFeesController.getNationalBillingFees
);
router.put(
  '/billing-prices/national/:feeKey',
  allowRoles('system_admin'),
  auditMiddleware('billing_fee'),
  adminBillingFeesController.updateNationalBillingFee
);

router.get(
  '/facilities/:id/billing-fees/history',
  allowRoles('system_admin'),
  adminBillingFeesController.getFacilityBillingFeeHistory
);
router.get(
  '/facilities/:id/billing-fees',
  allowRoles('system_admin'),
  adminBillingFeesController.getFacilityBillingFees
);
router.put(
  '/facilities/:id/billing-fees/:feeKey',
  allowRoles('system_admin'),
  auditMiddleware('billing_fee'),
  adminBillingFeesController.updateFacilityBillingFee
);

// User management
router.get('/users', authorize('user', 'read'), adminController.getUsers);
router.post('/users', authorize('user', 'create'), auditMiddleware('user'), adminController.createUser);
router.post('/system-admins', allowRoles('system_admin'), auditMiddleware('user'), adminController.createSystemAdmin);
router.put('/users/:id', authorize('user', 'update'), auditMiddleware('user'), adminController.updateUser);
router.post('/users/:id/transfer', authorize('user', 'update'), auditMiddleware('user'), adminController.transferEmployee);
router.get('/users/:id/facility-history', authorize('user', 'read'), adminController.getEmployeeFacilityHistory);

// Roles
router.get('/roles', authorize('user', 'read'), adminController.getRoles);

// Audit logs
router.get('/audit-logs', authorize('audit_log', 'read'), adminController.getAuditLogs);

// Patient records
router.get(
  '/patients/search',
  allowRoles('system_admin'),
  adminPatientRecordsController.searchPatients
);
router.get(
  '/patients/:id/medical-history',
  allowRoles('system_admin'),
  adminPatientRecordsController.getMedicalHistory
);
router.get(
  '/patients/:id/medical-history/export',
  allowRoles('system_admin'),
  adminPatientRecordsController.exportMedicalHistory
);
router.get(
  '/patients/:id/medical-card',
  allowRoles('system_admin'),
  adminPatientRecordsController.getMedicalCard
);

module.exports = router;
