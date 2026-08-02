const ParkingSession = require('../models/ParkingSession');
const ActivityLog = require('../models/ActivityLog');
const qrService = require('../services/qrService');
const allocationService = require('../services/allocationService');
const socketService = require('../services/socketService');

// Process Security QR Scan & Release Parking Slot
exports.processCheckout = async (req, res) => {
  try {
    const { qrToken, manualSessionId } = req.body;
    let session = null;

    if (qrToken) {
      const validation = qrService.validateQRToken(qrToken);
      if (!validation.valid) {
        return res.status(400).json({ success: false, message: validation.reason });
      }
      session = await ParkingSession.findOne({ sessionId: validation.payload.sessionId });
    } else if (manualSessionId) {
      session = await ParkingSession.findOne({ sessionId: manualSessionId.trim() });
    }

    if (!session) {
      return res.status(404).json({ success: false, message: 'Parking session not found.' });
    }

    if (session.status === 'Completed') {
      return res.status(400).json({
        success: false,
        message: 'PASS_ALREADY_USED: This parking pass has already been checked out.',
        session
      });
    }

    if (session.status !== 'Active') {
      return res.status(400).json({ success: false, message: `Session status is ${session.status}. Cannot checkout.` });
    }

    await session.populate([
      { path: 'lotId', select: 'name code' },
      { path: 'floorId', select: 'name floorNumber' },
      { path: 'slotId', select: 'slotNumber slotType' }
    ]);

    const checkOutTime = new Date();
    const durationMs = checkOutTime.getTime() - new Date(session.checkInTime).getTime();
    const durationMinutes = Math.max(1, Math.ceil(durationMs / (1000 * 60)));

    session.status = 'Completed';
    session.checkOutTime = checkOutTime;
    session.durationMinutes = durationMinutes;
    await session.save();

    await allocationService.releaseSlot(session.slotId._id);

    const performer = req.user ? `${req.user.role} (${req.user.username})` : 'Security Guard';
    await ActivityLog.create({
      action: 'CHECK_OUT',
      performer,
      lotId: session.lotId._id,
      details: `Vehicle ${session.vehicleNumber} checked out of Slot ${session.slotId.slotNumber}. Duration: ${durationMinutes} mins.`,
      metadata: { sessionId: session.sessionId, slotNumber: session.slotId.slotNumber, durationMinutes }
    });

    socketService.broadcastSessionCompleted(session.lotId._id, {
      sessionId: session.sessionId,
      slotNumber: session.slotId.slotNumber,
      vehicleNumber: session.vehicleNumber,
      durationMinutes
    });

    const hours = Math.floor(durationMinutes / 60);
    const mins = durationMinutes % 60;
    const durationFormatted = hours > 0 ? `${hours}h ${mins}m` : `${mins} mins`;

    return res.json({
      success: true,
      message: 'Checkout complete. Slot released successfully.',
      checkout: {
        sessionId: session.sessionId,
        vehicleNumber: session.vehicleNumber,
        slotNumber: session.slotId.slotNumber,
        floorName: session.floorId.name,
        checkInTime: session.checkInTime,
        checkOutTime: session.checkOutTime,
        durationMinutes,
        durationFormatted
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
