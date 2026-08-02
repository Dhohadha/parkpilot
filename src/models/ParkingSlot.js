const mongoose = require('mongoose');

const ParkingSlotSchema = new mongoose.Schema({
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
  slotNumber: {
    type: String,
    required: true,
    trim: true
  },
  slotType: {
    type: String,
    enum: ['Standard', 'VIP'],
    default: 'Standard'
  },
  row: {
    type: Number,
    required: true
  },
  col: {
    type: Number,
    required: true
  },
  distanceToEntrance: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['Available', 'Occupied', 'Reserved', 'Disabled'],
    default: 'Available'
  },
  currentSessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingSession',
    default: null
  }
}, {
  timestamps: true
});

ParkingSlotSchema.index({ lotId: 1, status: 1, distanceToEntrance: 1 });

module.exports = mongoose.model('ParkingSlot', ParkingSlotSchema);
