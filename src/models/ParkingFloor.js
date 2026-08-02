const mongoose = require('mongoose');

const ParkingFloorSchema = new mongoose.Schema({
  lotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingLot',
    required: true
  },
  floorNumber: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true // e.g. "Ground Floor", "Basement B1", "Basement B2"
  },
  gridRows: {
    type: Number,
    default: 6
  },
  gridCols: {
    type: Number,
    default: 8
  },
  entrancePos: {
    row: { type: Number, default: 0 },
    col: { type: Number, default: 0 }
  },
  exitPos: {
    row: { type: Number, default: 5 },
    col: { type: Number, default: 7 }
  },
  totalSlots: {
    type: Number,
    default: 0
  },
  occupiedSlots: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ParkingFloor', ParkingFloorSchema);
