const ParkingLot = require('../models/ParkingLot');
const ParkingFloor = require('../models/ParkingFloor');
const ParkingSlot = require('../models/ParkingSlot');
const ParkingSession = require('../models/ParkingSession');
const ActivityLog = require('../models/ActivityLog');
const socketService = require('../services/socketService');

exports.getLiveDashboard = async (req, res) => {
  try {
    let lot = await ParkingLot.findOne();
    if (!lot) {
      return res.status(404).json({ success: false, message: 'Parking lot not found.' });
    }

    const floors = await ParkingFloor.find({ lotId: lot._id }).sort({ floorNumber: 1 });
    const slots = await ParkingSlot.find({ lotId: lot._id }).populate('floorId', 'name floorNumber');

    const availableCount = slots.filter(s => s.status === 'Available').length;
    const occupiedCount = slots.filter(s => s.status === 'Occupied').length;
    const reservedCount = slots.filter(s => s.status === 'Reserved').length;
    const disabledCount = slots.filter(s => s.status === 'Disabled').length;

    const activeSessionsCount = await ParkingSession.countDocuments({ lotId: lot._id, status: 'Active' });

    return res.json({
      success: true,
      lot: {
        id: lot._id,
        code: lot.code,
        name: lot.name,
        totalSlots: slots.length,
        occupiedSlots: occupiedCount,
        availableSlots: availableCount,
        reservedSlots: reservedCount,
        disabledSlots: disabledCount,
        occupancyPercentage: slots.length > 0 ? ((occupiedCount / slots.length) * 100).toFixed(1) : 0,
        activeSessions: activeSessionsCount
      },
      floors,
      slots
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.overrideSlotStatus = async (req, res) => {
  try {
    const { slotId } = req.params;
    const { status } = req.body;

    if (!['Available', 'Occupied', 'Reserved', 'Disabled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid slot status value.' });
    }

    const slot = await ParkingSlot.findById(slotId).populate('floorId');
    if (!slot) {
      return res.status(404).json({ success: false, message: 'Slot not found.' });
    }

    const oldStatus = slot.status;
    slot.status = status;
    await slot.save();

    const lotId = slot.lotId;
    const occupiedCount = await ParkingSlot.countDocuments({ lotId, status: 'Occupied' });
    await ParkingLot.findByIdAndUpdate(lotId, { occupiedSlots: occupiedCount });

    const floorOccupiedCount = await ParkingSlot.countDocuments({ floorId: slot.floorId._id, status: 'Occupied' });
    await ParkingFloor.findByIdAndUpdate(slot.floorId._id, { occupiedSlots: floorOccupiedCount });

    const performer = req.user ? `${req.user.role} (${req.user.username})` : 'Admin';
    await ActivityLog.create({
      action: 'SLOT_OVERRIDE',
      performer,
      lotId: slot.lotId,
      details: `Slot ${slot.slotNumber} status changed from ${oldStatus} to ${status}.`,
      metadata: { slotId: slot._id, slotNumber: slot.slotNumber, oldStatus, newStatus: status }
    });

    socketService.broadcastSlotUpdate(slot.lotId, {
      slotId: slot._id,
      slotNumber: slot.slotNumber,
      floorId: slot.floorId._id,
      floorName: slot.floorId.name,
      status,
      row: slot.row,
      col: slot.col
    });

    return res.json({
      success: true,
      message: `Slot ${slot.slotNumber} status updated to ${status}.`,
      slot
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSessions = async (req, res) => {
  try {
    const { status, limit = 50, search } = req.query;
    const query = {};

    if (status && status !== 'ALL') {
      query.status = status;
    }

    if (search) {
      query.$or = [
        { vehicleNumber: { $regex: search, $options: 'i' } },
        { sessionId: { $regex: search, $options: 'i' } }
      ];
    }

    const sessions = await ParkingSession.find(query)
      .populate('lotId', 'name code')
      .populate('floorId', 'name')
      .populate('slotId', 'slotNumber')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    return res.json({ success: true, count: sessions.length, sessions });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const lot = await ParkingLot.findOne();
    if (!lot) {
      return res.status(404).json({ success: false, message: 'Parking lot not found.' });
    }

    const floors = await ParkingFloor.find({ lotId: lot._id });
    const slots = await ParkingSlot.find({ lotId: lot._id });

    const totalSlots = slots.length;
    const occupied = slots.filter(s => s.status === 'Occupied').length;
    const available = slots.filter(s => s.status === 'Available').length;
    const reserved = slots.filter(s => s.status === 'Reserved').length;
    const disabled = slots.filter(s => s.status === 'Disabled').length;

    const floorBreakdown = await Promise.all(floors.map(async (floor) => {
      const fSlots = slots.filter(s => s.floorId.toString() === floor._id.toString());
      const fOccupied = fSlots.filter(s => s.status === 'Occupied').length;
      return {
        floorName: floor.name,
        total: fSlots.length,
        occupied: fOccupied,
        available: fSlots.length - fOccupied,
        occupancyRate: fSlots.length > 0 ? parseFloat(((fOccupied / fSlots.length) * 100).toFixed(1)) : 0
      };
    }));

    const completedSessions = await ParkingSession.countDocuments({ lotId: lot._id, status: 'Completed' });
    const activeSessions = await ParkingSession.countDocuments({ lotId: lot._id, status: 'Active' });

    return res.json({
      success: true,
      analytics: {
        totalSlots,
        occupied,
        available,
        reserved,
        disabled,
        occupancyPercentage: totalSlots > 0 ? parseFloat(((occupied / totalSlots) * 100).toFixed(1)) : 0,
        activeSessions,
        completedSessions,
        floorBreakdown
      }
    });

  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

exports.getActivityLogs = async (req, res) => {
  try {
    const logs = await ActivityLog.find()
      .sort({ createdAt: -1 })
      .limit(100);

    return res.json({ success: true, count: logs.length, logs });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
