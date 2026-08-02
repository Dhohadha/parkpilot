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
      name: 'The Grand Multiplex Mall',
      address: '100 Central Mall Avenue, Tech District',
      totalSlots: 240,
      occupiedSlots: 0
    });

    console.log('[Seeder] Creating multi-floor levels...');
    const groundFloor = await ParkingFloor.create({
      lotId: lot._id,
      floorNumber: -1,
      name: 'Block A (Basement Level 1)',
      gridRows: 10,
      gridCols: 18,
      entrancePos: { row: 5, col: 0 },
      exitPos: { row: 5, col: 17 },
      totalSlots: 80
    });

    const basementB1 = await ParkingFloor.create({
      lotId: lot._id,
      floorNumber: -2,
      name: 'Block B (Basement Level 2)',
      gridRows: 10,
      gridCols: 18,
      entrancePos: { row: 5, col: 0 },
      exitPos: { row: 5, col: 17 },
      totalSlots: 80
    });

    const basementB2 = await ParkingFloor.create({
      lotId: lot._id,
      floorNumber: -3,
      name: 'Block C (Basement Level 3)',
      gridRows: 10,
      gridCols: 18,
      entrancePos: { row: 5, col: 0 },
      exitPos: { row: 5, col: 17 },
      totalSlots: 80
    });

    console.log('[Seeder] Creating uniform parking slots grid layout...');
    const slotsToInsert = [];

    const generateSlots = (floor, blockLetter) => {
      let slotIndex = 1;
      for (let r = 0; r < floor.gridRows; r++) {
        for (let c = 0; c < floor.gridCols; c++) {
          let isSlot = false;
          let slotType = 'Standard';

          // 1. Top perimeter slots (Cols 9 to 16, avoiding Lobby & Ramps at Cols 0-8)
          if (r === 0 && c >= 9 && c <= 16) {
            isSlot = true;
          }
          // 2. Bottom perimeter slots (Cols 4 to 15, avoiding Bottom Ramp at Cols 0-3)
          else if (r === 9 && c >= 4 && c <= 15) {
            isSlot = true;
          }
          // 3. Left vertical slots
          else if (c === 1 && r >= 2 && r <= 7) {
            isSlot = true;
          }
          // 4. Right vertical slots
          else if (c === 16 && r >= 2 && r <= 7) {
            isSlot = true;
          }
          // 5. Central Bank 1 (Columns 3 and 4, Rows 2 to 7)
          else if ((c === 3 || c === 4) && r >= 2 && r <= 7) {
            isSlot = true;
            if (r === 2) {
              slotType = 'VIP'; // Accessible/VIP slots
            }
          }
          // 6. Central Bank 2 (Columns 6 and 7, Rows 2 to 7)
          else if ((c === 6 || c === 7) && r >= 2 && r <= 7) {
            isSlot = true;
            if (c === 6 && r >= 2 && r <= 4) {
              slotType = 'EV'; // EV Charging slots
            }
          }
          // 7. Central Bank 3 (Columns 9 and 10, Rows 2 to 7)
          else if ((c === 9 || c === 10) && r >= 2 && r <= 7) {
            isSlot = true;
            if (c === 9 && r >= 2 && r <= 4) {
              slotType = 'EV'; // EV Charging slots
            }
          }
          // 8. Central Bank 4 (Columns 12 and 13, Rows 2 to 7)
          else if ((c === 12 || c === 13) && r >= 2 && r <= 7) {
            isSlot = true;
          }

          if (!isSlot) continue;

          const slotNumStr = `${blockLetter}-${slotIndex < 10 ? '0' + slotIndex : slotIndex}`;
          const dist = Math.sqrt(Math.pow(r - floor.entrancePos.row, 2) + Math.pow(c - floor.entrancePos.col, 2));

          slotsToInsert.push({
            lotId: lot._id,
            floorId: floor._id,
            slotNumber: slotNumStr,
            block: blockLetter,
            slotType: slotType,
            row: r,
            col: c,
            distanceToEntrance: parseFloat(dist.toFixed(2)),
            status: 'Available'
          });

          slotIndex++;
        }
      }
    };

    generateSlots(groundFloor, 'A');
    generateSlots(basementB1, 'B');
    generateSlots(basementB2, 'C');

    const createdSlots = await ParkingSlot.insertMany(slotsToInsert);
    console.log(`[Seeder] Created ${createdSlots.length} standard/VIP/EV parking slots across 3 blocks.`);

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
