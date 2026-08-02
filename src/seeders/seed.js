const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const connectDB = require('../config/db');
const ParkingLot = require('../models/ParkingLot');
const ParkingFloor = require('../models/ParkingFloor');
const ParkingSlot = require('../models/ParkingSlot');
const ParkingSession = require('../models/ParkingSession');
const AdminUser = require('../models/AdminUser');
const ActivityLog = require('../models/ActivityLog');

async function seedData() {
  try {
    console.log('[Seeder] Connecting to database...');
    await connectDB();

    console.log('[Seeder] Cleaning existing database collections...');
    await ParkingLot.deleteMany({});
    await ParkingFloor.deleteMany({});
    await ParkingSlot.deleteMany({});
    await ParkingSession.deleteMany({});
    await AdminUser.deleteMany({});
    await ActivityLog.deleteMany({});

    console.log('[Seeder] Creating main Parking Lot...');
    const lot = await ParkingLot.create({
      code: 'MAIN-01',
      name: 'SparkTank Central Facility',
      address: '100 Tech Hub Avenue, Metro District',
      totalSlots: 66,
      occupiedSlots: 0
    });

    console.log('[Seeder] Creating multi-floor levels...');
    const groundFloor = await ParkingFloor.create({
      lotId: lot._id,
      floorNumber: 0,
      name: 'Ground Floor (GF)',
      gridRows: 5,
      gridCols: 6,
      entrancePos: { row: 0, col: 0 },
      exitPos: { row: 4, col: 5 },
      totalSlots: 20
    });

    const basementB1 = await ParkingFloor.create({
      lotId: lot._id,
      floorNumber: -1,
      name: 'Basement Level 1 (B1)',
      gridRows: 5,
      gridCols: 6,
      entrancePos: { row: 0, col: 0 },
      exitPos: { row: 4, col: 5 },
      totalSlots: 23
    });

    const basementB2 = await ParkingFloor.create({
      lotId: lot._id,
      floorNumber: -2,
      name: 'Basement Level 2 (B2)',
      gridRows: 5,
      gridCols: 6,
      entrancePos: { row: 0, col: 0 },
      exitPos: { row: 4, col: 5 },
      totalSlots: 23
    });

    console.log('[Seeder] Creating uniform parking slots grid layout...');
    const slotsToInsert = [];

    const generateSlots = (floor, prefix) => {
      let slotIndex = 1;
      for (let r = 0; r < floor.gridRows; r++) {
        for (let c = 0; c < floor.gridCols; c++) {
          if ((r === 0 && c === 0) || (r === floor.gridRows - 1 && c === floor.gridCols - 1)) {
            continue;
          }
          if ((c === 2 || c === 3) && r > 0 && r < floor.gridRows - 1) {
            continue;
          }

          const slotNumStr = `${prefix}-${slotIndex < 10 ? '0' + slotIndex : slotIndex}`;
          const dist = Math.sqrt(Math.pow(r - floor.entrancePos.row, 2) + Math.pow(c - floor.entrancePos.col, 2));

          slotsToInsert.push({
            lotId: lot._id,
            floorId: floor._id,
            slotNumber: slotNumStr,
            slotType: 'Standard',
            row: r,
            col: c,
            distanceToEntrance: parseFloat(dist.toFixed(2)),
            status: 'Available'
          });

          slotIndex++;
        }
      }
    };

    generateSlots(groundFloor, 'GF');
    generateSlots(basementB1, 'B1');
    generateSlots(basementB2, 'B2');

    const createdSlots = await ParkingSlot.insertMany(slotsToInsert);
    console.log(`[Seeder] Created ${createdSlots.length} standard parking slots across 3 floors.`);

    await ParkingLot.findByIdAndUpdate(lot._id, { totalSlots: createdSlots.length });

    console.log('[Seeder] Creating Admin & Security users...');
    const adminPasswordHash = await bcrypt.hash('admin123', 10);
    const securityPasswordHash = await bcrypt.hash('security123', 10);

    await AdminUser.create({
      username: 'admin',
      email: 'admin@parkpilot.com',
      passwordHash: adminPasswordHash,
      role: 'SuperAdmin',
      assignedLotId: lot._id
    });

    await AdminUser.create({
      username: 'security',
      email: 'security@parkpilot.com',
      passwordHash: securityPasswordHash,
      role: 'SecurityGuard',
      assignedLotId: lot._id
    });

    console.log('[Seeder] Creating initial activity log...');
    await ActivityLog.create({
      action: 'SYSTEM_INIT',
      performer: 'System',
      lotId: lot._id,
      details: `ParkPilot clean facility initialization complete with ${createdSlots.length} slots.`
    });

    console.log('\n======================================================');
    console.log('       PARKPILOT SEEDING COMPLETED SUCCESSFULLY       ');
    console.log('======================================================');
    console.log('Lot Code:       MAIN-01');
    console.log('SuperAdmin:     admin@parkpilot.com / admin123');
    console.log('Security Guard:  security@parkpilot.com / security123');
    console.log('Total Slots:    ', createdSlots.length);
    console.log('======================================================\n');

    process.exit(0);
  } catch (error) {
    console.error('[Seeder Error]', error);
    process.exit(1);
  }
}

seedData();
