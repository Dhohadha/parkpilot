const ParkingLot = require('../models/ParkingLot');
const ParkingFloor = require('../models/ParkingFloor');
const ParkingSlot = require('../models/ParkingSlot');
const ParkingSession = require('../models/ParkingSession');
const ActivityLog = require('../models/ActivityLog');
const allocationService = require('../services/allocationService');
const qrService = require('../services/qrService');
const socketService = require('../services/socketService');
const QRCode = require('qrcode');

exports.getLotInfo = async (req, res) => {
  try {
    const lotCode = req.query.lot || 'MAIN-01';
    let lot = await ParkingLot.findOne({ code: lotCode });

    if (!lot) {
      lot = await ParkingLot.findOne();
    }

    if (!lot) {
      return res.status(404).json({ success: false, message: 'No active parking lot found. Please run seed script.' });
    }

    const floors = await ParkingFloor.find({ lotId: lot._id }).sort({ floorNumber: 1 });

    return res.json({
      success: true,
      lot: {
        id: lot._id,
        code: lot.code,
        name: lot.name,
        address: lot.address,
        totalSlots: lot.totalSlots,
        occupiedSlots: lot.occupiedSlots,
        availableSlots: lot.totalSlots - lot.occupiedSlots
      },
      floors
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.checkIn = async (req, res) => {
  try {
    const { lotCode = 'MAIN-01', vehicleNumber = 'SPARK-2026' } = req.body;
    const formattedVehicle = vehicleNumber.toUpperCase().trim();

    let lot = await ParkingLot.findOne({ code: lotCode.toUpperCase() });
    if (!lot) {
      lot = await ParkingLot.findOne();
    }

    if (!lot) {
      return res.status(404).json({ success: false, message: 'Parking lot not found.' });
    }

    // SAFEGUARD: Check if vehicle already has an ACTIVE parking session (Prevent duplicate slot reservation)
    const existingSession = await ParkingSession.findOne({
      vehicleNumber: formattedVehicle,
      status: 'Active'
    })
    .populate('floorId')
    .populate('slotId');

    if (existingSession) {
      const floorSlots = await ParkingSlot.find({ floorId: existingSession.floorId._id })
        .select('slotNumber slotType row col status distanceToEntrance');

      return res.status(200).json({
        success: true,
        isExisting: true,
        message: `ACTIVE_SESSION_RESTORED: Vehicle ${formattedVehicle} already has slot ${existingSession.slotId.slotNumber}.`,
        session: {
          sessionId: existingSession.sessionId,
          vehicleNumber: existingSession.vehicleNumber,
          checkInTime: existingSession.checkInTime,
          qrToken: existingSession.qrToken,
          qrDataUrl: await QRCode.toDataURL(existingSession.qrToken, { margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
        },
        lot: {
          code: lot.code,
          name: lot.name
        },
        assignedSlot: {
          id: existingSession.slotId._id,
          slotNumber: existingSession.slotId.slotNumber,
          slotType: existingSession.slotId.slotType,
          row: existingSession.slotId.row,
          col: existingSession.slotId.col,
          floorName: existingSession.floorId.name,
          floorNumber: existingSession.floorId.floorNumber
        },
        blueprint: {
          gridRows: existingSession.floorId.gridRows,
          gridCols: existingSession.floorId.gridCols,
          entrancePos: existingSession.floorId.entrancePos,
          exitPos: existingSession.floorId.exitPos,
          slots: floorSlots
        }
      });
    }

    // Allocate new nearest available slot
    const slot = await allocationService.allocateNearestSlot(lot._id);
    const floor = await ParkingFloor.findById(slot.floorId);

    const sessionId = `PS-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const { token, signature } = qrService.generateQRToken(sessionId, slot.slotNumber, lot.code);

    const session = await ParkingSession.create({
      sessionId,
      lotId: lot._id,
      floorId: floor._id,
      slotId: slot._id,
      vehicleNumber: formattedVehicle,
      qrToken: token,
      qrSignature: signature,
      checkInTime: new Date(),
      status: 'Active'
    });

    slot.currentSessionId = session._id;
    await slot.save();

    await ActivityLog.create({
      action: 'CHECK_IN',
      performer: 'Driver',
      lotId: lot._id,
      details: `Vehicle ${session.vehicleNumber} checked in. Slot ${slot.slotNumber} allocated on floor ${floor.name}.`,
      metadata: { sessionId: session.sessionId, slotNumber: slot.slotNumber }
    });

    const floorSlots = await ParkingSlot.find({ floorId: floor._id }).select('slotNumber slotType row col status distanceToEntrance');

    socketService.broadcastSessionCreated(lot._id, {
      sessionId: session.sessionId,
      slotNumber: slot.slotNumber,
      floorName: floor.name,
      vehicleNumber: session.vehicleNumber,
      checkInTime: session.checkInTime
    });

    return res.status(201).json({
      success: true,
      isExisting: false,
      message: 'Parking slot successfully allocated!',
      session: {
        sessionId: session.sessionId,
        vehicleNumber: session.vehicleNumber,
        checkInTime: session.checkInTime,
        qrToken: session.qrToken,
        qrDataUrl: await QRCode.toDataURL(session.qrToken, { margin: 1, color: { dark: '#0f172a', light: '#ffffff' } })
      },
      lot: {
        code: lot.code,
        name: lot.name
      },
      assignedSlot: {
        id: slot._id,
        slotNumber: slot.slotNumber,
        slotType: slot.slotType,
        row: slot.row,
        col: slot.col,
        floorName: floor.name,
        floorNumber: floor.floorNumber
      },
      blueprint: {
        gridRows: floor.gridRows,
        gridCols: floor.gridCols,
        entrancePos: floor.entrancePos,
        exitPos: floor.exitPos,
        slots: floorSlots
      }
    });

  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

exports.getSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await ParkingSession.findOne({ sessionId })
      .populate('lotId', 'name code address')
      .populate('floorId', 'name floorNumber gridRows gridCols entrancePos exitPos')
      .populate('slotId', 'slotNumber slotType row col status');

    if (!session) {
      return res.status(404).json({ success: false, message: 'Parking session not found.' });
    }

    const floorSlots = await ParkingSlot.find({ floorId: session.floorId._id })
      .select('slotNumber slotType row col status');

    return res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        vehicleNumber: session.vehicleNumber,
        checkInTime: session.checkInTime,
        qrToken: session.qrToken,
        qrDataUrl: await QRCode.toDataURL(session.qrToken, { margin: 1, color: { dark: '#0f172a', light: '#ffffff' } }),
        status: session.status
      },
      lot: {
        code: session.lotId.code,
        name: session.lotId.name
      },
      assignedSlot: {
        id: session.slotId._id,
        slotNumber: session.slotId.slotNumber,
        slotType: session.slotId.slotType,
        row: session.slotId.row,
        col: session.slotId.col,
        floorName: session.floorId.name,
        floorNumber: session.floorId.floorNumber
      },
      blueprint: {
        gridRows: session.floorId.gridRows,
        gridCols: session.floorId.gridCols,
        entrancePos: session.floorId.entrancePos,
        exitPos: session.floorId.exitPos,
        slots: floorSlots
      }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Generate Static Entrance QR Code PNG/DataURL
exports.getEntranceQR = async (req, res) => {
  try {
    const host = req.get('host');
    const protocol = req.protocol;
    const targetUrl = `${protocol}://${host}/?lot=MAIN-01`;

    const qrDataUrl = await QRCode.toDataURL(targetUrl, {
      width: 400,
      margin: 2,
      color: { dark: '#1e3a8a', light: '#ffffff' }
    });

    return res.json({
      success: true,
      lotCode: 'MAIN-01',
      targetUrl,
      qrDataUrl
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
