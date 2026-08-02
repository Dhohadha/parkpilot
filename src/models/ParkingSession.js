const mongoose = require('mongoose');

const ParkingSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  lotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingLot',
    required: true
  },
  floorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingFloor',
    required: true
  },
  slotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSlot',
    required: true
  },
  vehicleNumber: {
    type: String,
    default: 'ANONYMOUS'
  },
  qrToken: {
    type: String,
    required: true,
    unique: true
  },
  qrSignature: {
    type: String,
    required: true
  },
  checkInTime: {
    type: Date,
    default: Date.now
  },
  checkOutTime: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['Active', 'Completed', 'Expired', 'Cancelled'],
    default: 'Active'
  },
  durationMinutes: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ParkingSession', ParkingSessionSchema);
