const router = require('express').Router();
const frontOfficeController = require('../controllers/frontOffice.controller');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.use(authenticate);

router.get(
  '/routing-options',
  authorize('patient', 'read'),
  frontOfficeController.getRoutingOptions
);

router.get(
  '/my-registrations',
  authorize('patient', 'read'),
  frontOfficeController.getMyRegistrations
);

router.post(
  '/consent/send-otp',
  authorize('patient', 'create'),
  frontOfficeController.sendConsentOtp
);

router.post(
  '/consent/verify-otp',
  authorize('patient', 'create'),
  frontOfficeController.verifyConsentOtp
);

module.exports = router;
