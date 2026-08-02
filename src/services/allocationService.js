const ParkingSlot = require('../models/ParkingSlot');
const ParkingLot = require('../models/ParkingLot');
const ParkingFloor = require('../models/ParkingFloor');
const socketService = require('./socketService');

/**
 * Atomically allocates nearest available parking slot in a given lot
 */
async function allocateNearestSlot(lotId) {
  const candidateSlots = await ParkingSlot.find({
    lotId,
    status: 'Available'
  }).sort({ distanceToEntrance: 1 }).limit(5);

  if (!candidateSlots || candidateSlots.length === 0) {
    throw new Error('PARKING_FULL: All parking slots are currently occupied.');
  }

  let reservedSlot = null;

  for (const slot of candidateSlots) {
    const updated = await ParkingSlot.findOneAndUpdate(
      { _id: slot._id, status: 'Available' },
      { status: 'Occupied' },
      { new: true }
    ).populate('floorId');

    if (updated) {
      reservedSlot = updated;
      break;
    }
  }

  if (!reservedSlot) {
    throw new Error('CONCURRENCY_RETRY: Slot was claimed by another driver, please try again.');
  }

  await ParkingFloor.findByIdAndUpdate(reservedSlot.floorId._id, { $inc: { occupiedSlots: 1 } });
  await ParkingLot.findByIdAndUpdate(lotId, { $inc: { occupiedSlots: 1 } });

  socketService.broadcastSlotUpdate(lotId, {
    slotId: reservedSlot._id,
    slotNumber: reservedSlot.slotNumber,
    floorId: reservedSlot.floorId._id,
    floorName: reservedSlot.floorId.name,
    status: 'Occupied',
    row: reservedSlot.row,
    col: reservedSlot.col
  });

  return reservedSlot;
}

/**
 * Release an occupied slot back to 'Available' status
 */
async function releaseSlot(slotId) {
  const slot = await ParkingSlot.findById(slotId).populate('floorId');
  if (!slot) return null;

  const previousStatus = slot.status;

  slot.status = 'Available';
  slot.currentSessionId = null;
  await slot.save();

  if (previousStatus === 'Occupied' || previousStatus === 'Reserved') {
    await ParkingFloor.findByIdAndUpdate(slot.floorId._id, { $inc: { occupiedSlots: -1 } });
    await ParkingLot.findByIdAndUpdate(slot.lotId, { $inc: { occupiedSlots: -1 } });
  }

  socketService.broadcastSlotUpdate(slot.lotId, {
    slotId: slot._id,
    slotNumber: slot.slotNumber,
    floorId: slot.floorId._id,
    floorName: slot.floorId.name,
    status: 'Available',
    row: slot.row,
    col: slot.col
  });

  return slot;
}

module.exports = {
  allocateNearestSlot,
  releaseSlot
};
