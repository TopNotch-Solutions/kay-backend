const router = require('express').Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

router.post('/login', authLimiter, authController.login);
router.post('/refresh', authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);
router.post('/set-password', authenticate, authLimiter, authController.setPassword);
router.post('/forgot-password/request', authLimiter, authController.forgotPasswordRequest);
router.post('/forgot-password/reset', authLimiter, authController.forgotPasswordReset);

module.exports = router;
