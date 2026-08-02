const express = require('express');
const router = express.Router();
const publicController = require('../controllers/publicController');

router.get('/lot-info', publicController.getLotInfo);
router.post('/check-in', publicController.checkIn);
router.get('/session/:sessionId', publicController.getSessionStatus);
router.get('/entrance-qr', publicController.getEntranceQR);

module.exports = router;
