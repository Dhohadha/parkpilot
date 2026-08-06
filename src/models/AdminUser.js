const mongoose = require('mongoose');

const AdminUserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  passwordHash: {
    type: String,
    required: false
  },
  role: {
    type: String,
    enum: ['SuperAdmin', 'Manager', 'SecurityGuard'],
    default: 'SecurityGuard'
  },
  assignedLotId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParkingLot',
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AdminUser', AdminUserSchema);
