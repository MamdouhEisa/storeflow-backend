const express = require('express');
const { login, registerAdmin, changePassword, me } = require('../controllers/authController');
const { validate, schemas } = require('../middleware/validate');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

router.post('/register-admin', registerAdmin); // No validation - branch auto-set
router.post('/login', validate(schemas.login), login);
router.get('/me', authMiddleware, me);
router.patch('/change-password', authMiddleware, validate(schemas.changePassword), changePassword);

module.exports = router;

