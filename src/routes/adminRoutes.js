const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const checkoutController = require('../controllers/checkoutController');
const authController = require('../controllers/authController');

// Public or Protected checkout route (Security guards)
router.post('/checkout', checkoutController.processCheckout);

// Admin dashboard routes (Can be used with optional auth for quick demo)
router.get('/live', adminController.getLiveDashboard);
router.patch('/slots/:slotId/status', adminController.overrideSlotStatus);
router.get('/sessions', adminController.getSessions);
router.get('/analytics', adminController.getAnalytics);
router.get('/activity-logs', adminController.getActivityLogs);

module.exports = router;
