const router = require('express').Router();
const doctorController = require('../controllers/doctor.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { auditMiddleware } = require('../middleware/audit');

router.use(authenticate);

router.get('/appointments', authorize('consultation', 'read'), doctorController.listAppointments);
router.post(
  '/appointments/:consultationId/cancel',
  authorize('consultation', 'update'),
  auditMiddleware('consultation'),
  doctorController.cancelAppointment
);

// Consultations
router.post('/', authorize('consultation', 'create'), auditMiddleware('consultation'), doctorController.createConsultation);
router.get('/visit/:visitId', authorize('consultation', 'read'), doctorController.getByVisit);
router.put('/:id', authorize('consultation', 'update'), auditMiddleware('consultation'), doctorController.updateConsultation);
router.get('/:id', authorize('consultation', 'read'), doctorController.getById);

// Prescriptions (optional — also synced via consultation payload)
router.post('/prescriptions', authorize('prescription', 'create'), auditMiddleware('prescription'), doctorController.createPrescription);

module.exports = router;
