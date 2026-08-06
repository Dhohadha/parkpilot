const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

router.post('/login', authController.login);
router.post('/firebase-login', authController.firebaseLogin);
router.get('/me', authController.protect, authController.getMe);

module.exports = router;
