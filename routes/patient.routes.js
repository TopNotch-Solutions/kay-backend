const router = require('express').Router();
const patientController = require('../controllers/patient.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

router.use(authenticate);

router.post('/', authorize('patient', 'create'), auditMiddleware('patient'), patientController.register);
router.get('/search', authorize('patient', 'read'), patientController.search);
router.get('/', authorize('patient', 'read'), patientController.getAll);
router.get('/:id', authorize('patient', 'read'), patientController.getById);
router.get(
  '/:id/clinical-medical-history',
  authorize('patient', 'read'),
  patientController.getClinicalMedicalHistory
);
router.get(
  '/:id/medical-card',
  authorize('patient', 'read'),
  patientController.getMedicalCard
);
router.get('/:id/history', authorize('patient', 'read'), patientController.getHistory);
router.put('/:id', authorize('patient', 'update'), auditMiddleware('patient'), patientController.update);
router.post('/:id/visits', authorize('patient', 'create'), auditMiddleware('patient'), patientController.createVisit);

module.exports = router;
