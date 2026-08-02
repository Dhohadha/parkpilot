/* ==========================================================================
   PARKPILOT - CLEAN LIGHT PUBLIC WEB APP LOGIC & SESSION PERSISTENCE
   ========================================================================== */

let currentLot = null;
let activeSession = null;
let timerInterval = null;
let socket = null;
let selectedBlock = 'A';

document.addEventListener('DOMContentLoaded', async () => {
  initSocket();
  await fetchLotInfo();
  setupEventListeners();
  checkPersistedSession();
});

function initSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('[Socket.IO] Connected to server:', socket.id);
  });

  socket.on('slot:updated', (slotData) => {
    fetchLotInfo();
    if (activeSession && slotData.slotId === activeSession.assignedSlot.id) {
      activeSession.assignedSlot.status = slotData.status;
    }
    renderBlueprintGrid();
  });

  socket.on('session:completed', (data) => {
    if (activeSession && data.sessionId === activeSession.session.sessionId) {
      localStorage.removeItem('parkpilot_active_session');
      alert('Your parking session has been completed by security gate exit. Slot released.');
      location.reload();
    }
  });
}

async function fetchLotInfo() {
  try {
    const res = await fetch('/api/public/lot-info');
    const data = await res.json();

    if (data.success) {
      currentLot = data.lot;
      currentLot.floors = data.floors;
      document.getElementById('statAvailable').innerText = data.lot.availableSlots;
      document.getElementById('statTotal').innerText = data.lot.totalSlots;
      document.getElementById('statFloors').innerText = data.floors.length;

      if (socket && currentLot) {
        socket.emit('join_lot', currentLot.id);
      }
      renderBlueprintGrid();
    }
  } catch (err) {
    console.error('Error fetching lot info:', err);
  }
}

// SAFEGUARD: Check & Restore Active Session on Page Refresh / Re-open
async function checkPersistedSession() {
  const savedSessionId = localStorage.getItem('parkpilot_active_session');
  if (!savedSessionId) return;

  try {
    const res = await fetch(`/api/public/session/${savedSessionId}`);
    const data = await res.json();

    if (data.success && data.session && data.session.status === 'Active') {
      console.log('[Session Persistence] Restoring active parking session:', savedSessionId);
      displaySessionPass(data, false); // Restore view without auto-downloading again on refresh
    } else {
      localStorage.removeItem('parkpilot_active_session');
    }
  } catch (e) {
    console.error('Error checking persisted session:', e);
  }
}

function setupEventListeners() {
  document.getElementById('btnCheckIn').addEventListener('click', handleCheckIn);
  document.getElementById('btnDownloadPass').addEventListener('click', () => downloadPassPNG());

  document.getElementById('btnToggleMap').addEventListener('click', () => {
    document.getElementById('blueprintContainer').scrollIntoView({ behavior: 'smooth' });
  });

  document.getElementById('btnNewCheckIn').addEventListener('click', () => {
    if (confirm('Start a new check-in? Make sure your current vehicle has checked out.')) {
      if (timerInterval) clearInterval(timerInterval);
      localStorage.removeItem('parkpilot_active_session');
      activeSession = null;
      document.getElementById('stepPassView').classList.remove('active');
      document.getElementById('stepCheckIn').classList.add('active');
      fetchLotInfo();
    }
  });

  const tabs = document.querySelectorAll('.block-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedBlock = tab.getAttribute('data-block');
      renderBlueprintGrid();
    });
  });
}

async function handleCheckIn() {
  const btn = document.getElementById('btnCheckIn');
  const errBox = document.getElementById('checkInError');
  const vehicleInput = document.getElementById('vehicleInput').value.trim();

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Allocating Slot...';
  errBox.classList.add('hidden');

  try {
    const response = await fetch('/api/public/check-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lotCode: currentLot ? currentLot.code : 'MAIN-01',
        vehicleNumber: vehicleInput || 'SPARK-2026'
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.message);
    }

    // Save Session ID to Local Storage to prevent duplicate allocations on page refresh
    localStorage.setItem('parkpilot_active_session', data.session.sessionId);

    // Display session pass & auto-download PNG pass
    displaySessionPass(data, true);

  } catch (error) {
    errBox.innerText = error.message;
    errBox.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Allocate Nearest Available Slot</span> <i class="fa-solid fa-arrow-right"></i>';
  }
}

async function displaySessionPass(data, triggerAutoDownload = false) {
  activeSession = data;
  if (!currentLot || !currentLot.floors) {
    await fetchLotInfo();
  }

  document.getElementById('stepCheckIn').classList.remove('active');
  document.getElementById('stepPassView').classList.add('active');

  document.getElementById('passSlotNum').innerText = data.assignedSlot.slotNumber;
  document.getElementById('passFloorNum').innerText = data.assignedSlot.floorName;
  document.getElementById('passVehicle').innerText = data.session.vehicleNumber;
  document.getElementById('passSessionId').innerText = data.session.sessionId;
  document.getElementById('currentFloorTag').innerText = `Floor: ${data.assignedSlot.floorName}`;

  if (data.assignedSlot && data.assignedSlot.block) {
    selectedBlock = data.assignedSlot.block;
    const tabs = document.querySelectorAll('.block-tab');
    tabs.forEach(tab => {
      if (tab.getAttribute('data-block') === selectedBlock) {
        tab.classList.add('active');
      } else {
        tab.classList.remove('active');
      }
    });
  }

  const checkInDate = new Date(data.session.checkInTime);
  document.getElementById('passEntryTime').innerText = checkInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // Render Exit Pass QR Code using pre-generated server DataURL
  const qrImgEl = document.getElementById('qrImg');
  if (qrImgEl && data.session.qrDataUrl) {
    qrImgEl.src = data.session.qrDataUrl;
  }

  startLiveTimer(checkInDate);
  renderBlueprintGrid();

  if (triggerAutoDownload) {
    setTimeout(() => {
      downloadPassPNG();
    }, 400);
  }
}


function renderBlueprintGrid() {
  if (!currentLot || !currentLot.floors) return;

  const activeFloor = currentLot.floors.find(f => f.name.includes(`Block ${selectedBlock}`));
  if (!activeFloor) return;

  const { gridRows, gridCols, entrancePos, exitPos } = activeFloor;
  const slots = activeFloor.slots || [];

  const gridContainer = document.getElementById('blueprintGrid');
  gridContainer.style.gridTemplateColumns = '1fr';
  gridContainer.innerHTML = '';

  const slotMap = new Map();
  slots.forEach(s => slotMap.set(`${s.row}_${s.col}`, s));

  // Determine if we need to draw path directions
  let path = null;
  const isAssignedBlock = (activeSession && activeSession.assignedSlot && activeSession.assignedSlot.block === selectedBlock);

  if (isAssignedBlock) {
    const targetCell = {
      row: activeSession.assignedSlot.row,
      col: activeSession.assignedSlot.col
    };
    path = findPathBFS(gridRows, gridCols, entrancePos, targetCell, slotMap);
  }

  // Generate and insert high-fidelity architectural blueprint SVG
  const svgContent = renderArchitecturalBlueprintSVG(gridRows, gridCols, entrancePos, exitPos, slotMap, activeSession, selectedBlock, path);
  gridContainer.innerHTML = svgContent;

  // Display direction guidance
  const directionsContainer = document.getElementById('directionsContainer');
  const directionsSteps = document.getElementById('directionsSteps');
  const directionsDistance = document.getElementById('directionsDistance');

  if (activeSession && directionsContainer && directionsSteps) {
    directionsContainer.classList.remove('hidden');

    if (isAssignedBlock && path) {
      directionsDistance.innerText = `${path.length - 1} steps (${((path.length - 1) * 2.5).toFixed(0)}m)`;
      const steps = generateDirectionSteps(path);
      directionsSteps.innerHTML = '';
      
      steps.forEach((step, index) => {
        const stepEl = document.createElement('div');
        stepEl.className = 'direction-step-item';

        let icon = 'fa-arrow-right';
        if (index === 0) icon = 'fa-door-open';
        else if (index === steps.length - 1) icon = 'fa-square-parking';
        else if (step.desc.includes('LEFT') || step.desc.includes('Left')) icon = 'fa-arrow-left';
        else if (step.desc.includes('RIGHT') || step.desc.includes('Right')) icon = 'fa-arrow-right';
        else if (step.desc.includes('UP') || step.desc.includes('up')) icon = 'fa-arrow-up';
        else if (step.desc.includes('DOWN') || step.desc.includes('down') || step.desc.includes('ahead')) icon = 'fa-arrow-down';

        stepEl.innerHTML = `
          <div class="step-icon-box">
            <i class="fa-solid ${icon}"></i>
          </div>
          <div class="step-text-box">
            <span class="step-text-desc">${step.desc}</span>
            <span class="step-text-sub">${step.sub}</span>
          </div>
        `;
        directionsSteps.appendChild(stepEl);
      });
    } else {
      directionsDistance.innerText = '';
      directionsSteps.innerHTML = `
        <div style="text-align: center; padding: 20px 10px; color: var(--text-muted); font-size: 13px; width: 100%;">
          <i class="fa-solid fa-circle-info" style="font-size: 20px; color: var(--primary); margin-bottom: 8px; display: block;"></i>
          Your assigned slot <strong>${activeSession.assignedSlot.slotNumber}</strong> is on <strong>${activeSession.assignedSlot.floorName}</strong>.<br>
          <button class="btn-primary" style="margin-top: 12px; padding: 8px 16px; font-size: 12px; display: inline-flex;" id="btnSwitchToAssigned">
            Switch to ${activeSession.assignedSlot.floorName} to view path
          </button>
        </div>
      `;
      document.getElementById('btnSwitchToAssigned').addEventListener('click', () => {
        const assignedBlock = activeSession.assignedSlot.block;
        const targetTab = document.querySelector(`.block-tab[data-block="${assignedBlock}"]`);
        if (targetTab) targetTab.click();
      });
    }
  } else {
    if (directionsContainer) directionsContainer.classList.add('hidden');
  }
}

function renderArchitecturalBlueprintSVG(gridRows, gridCols, entrancePos, exitPos, slotMap, activeSession, selectedBlock, path) {
  const cellW = 50;
  const cellH = 50;
  const svgWidth = gridCols * cellW; // 900
  const svgHeight = gridRows * cellH; // 500

  let svgHtml = `
    <svg viewBox="0 0 ${svgWidth} ${svgHeight}" width="100%" height="auto" xmlns="http://www.w3.org/2000/svg" style="background:#2b3e50; border-radius:12px; font-family: sans-serif;">
      <defs>
        <!-- Blueprint Grid Pattern -->
        <pattern id="blueprintGridPattern" width="25" height="25" patternUnits="userSpaceOnUse">
          <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#ffffff" stroke-width="0.5" stroke-opacity="0.08"/>
        </pattern>
        <!-- Glowing Route Animation Filter -->
        <filter id="routeGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      <!-- Background Grid -->
      <rect width="${svgWidth}" height="${svgHeight}" fill="#2b3e50" rx="12"/>
      <rect width="${svgWidth}" height="${svgHeight}" fill="url(#blueprintGridPattern)" />

      <!-- Outer Blueprint Border -->
      <rect x="2" y="2" width="${svgWidth - 4}" height="${svgHeight - 4}" fill="none" stroke="#ffffff" stroke-opacity="0.2" stroke-width="2" rx="10"/>

      <!-- LEFT RAMPS SECTION -->
      <g opacity="0.85">
        <path d="M 10 120 C 10 30, 30 10, 120 10 L 240 10 L 240 50 L 120 50 C 60 50, 50 60, 50 120 Z" fill="#1e2b37" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.5"/>
        <text x="120" y="32" fill="#ffffff" font-size="10" font-weight="bold" letter-spacing="1">RAMP UP TO P3 ➔</text>
        
        <path d="M 50 140 C 50 80, 80 55, 140 55 L 240 55 L 240 90 L 140 90 C 90 90, 80 100, 80 140 Z" fill="#1e2b37" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.5"/>
        <text x="135" y="76" fill="#ffffff" font-size="9" font-weight="bold" letter-spacing="1">RAMP UP TO P1 ➔</text>

        <path d="M 10 380 C 10 470, 30 490, 120 490 L 240 490 L 240 450 L 120 450 C 60 450, 50 440, 50 380 Z" fill="#1e2b37" stroke="#ffffff" stroke-opacity="0.3" stroke-width="1.5"/>
        <text x="110" y="474" fill="#ffffff" font-size="9" font-weight="bold" letter-spacing="1">RAMP DOWN TO B3 ➔</text>
      </g>

      <!-- TOP MALL ENTRANCE & ELEVATORS LOBBY -->
      <g>
        <rect x="250" y="6" width="220" height="74" fill="#3c556e" stroke="#ffffff" stroke-width="1.5" rx="6"/>
        <rect x="360" y="10" width="100" height="30" fill="#2b3e50" stroke="#ffffff" stroke-opacity="0.4" rx="4"/>
        <text x="410" y="29" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">LOBBY</text>
        
        <rect x="370" y="44" width="22" height="22" fill="#1e2b37" stroke="#10b981" rx="3"/>
        <text x="381" y="59" fill="#10b981" font-size="12" text-anchor="middle">🛗</text>
        <rect x="398" y="44" width="22" height="22" fill="#1e2b37" stroke="#10b981" rx="3"/>
        <text x="409" y="59" fill="#10b981" font-size="12" text-anchor="middle">🛗</text>
        
        <text x="260" y="32" fill="#ffffff" font-size="10" font-weight="bold">MALL ENTRANCE</text>
        <text x="260" y="46" fill="#10b981" font-size="9" font-weight="bold">& ELEVATORS</text>
      </g>

      <!-- VEHICLE ENTRY & EXIT MARKS -->
      <g font-size="11" font-weight="bold" fill="#ffffff">
        <rect x="0" y="235" width="40" height="30" fill="#10b981" rx="4"/>
        <text x="20" y="254" text-anchor="middle" fill="#ffffff">IN ◄</text>
        
        <rect x="860" y="235" width="40" height="30" fill="#ef4444" rx="4"/>
        <text x="880" y="254" text-anchor="middle" fill="#ffffff">OUT ►</text>
      </g>

      <!-- TRAFFIC FLOW ARROWS ON LANES -->
      <g fill="#ffffff" opacity="0.35">
        <path d="M 280 92 L 295 97 L 280 102 Z" />
        <path d="M 450 92 L 465 97 L 450 102 Z" />
        <path d="M 620 92 L 635 97 L 620 102 Z" />
        <path d="M 780 92 L 795 97 L 780 102 Z" />

        <path d="M 790 442 L 775 447 L 790 452 Z" />
        <path d="M 620 442 L 605 447 L 620 452 Z" />
        <path d="M 450 442 L 435 447 L 450 452 Z" />
        <path d="M 280 442 L 265 447 L 280 452 Z" />
      </g>
  `;

  // DRAW PARKING SLOTS
  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const key = `${r}_${c}`;
      if (slotMap.has(key)) {
        const slot = slotMap.get(key);
        const x = c * cellW + 2;
        const y = r * cellH + 2;
        const w = cellW - 4;
        const h = cellH - 4;

        const isUserSlot = (activeSession && slot.slotNumber === activeSession.assignedSlot.slotNumber);

        let bg = '#1e2b37';
        let stroke = '#ffffff';
        let strokeOpacity = '0.3';
        let textColor = '#ffffff';

        if (isUserSlot) {
          bg = '#2563eb';
          stroke = '#60a5fa';
          strokeOpacity = '1';
          textColor = '#ffffff';
        } else if (slot.status === 'Available') {
          bg = '#064e3b';
          stroke = '#10b981';
          strokeOpacity = '0.8';
          textColor = '#34d399';
        } else if (slot.status === 'Occupied') {
          bg = '#7f1d1d';
          stroke = '#ef4444';
          strokeOpacity = '0.8';
          textColor = '#fca5a5';
        }

        let iconSymbol = '';
        if (slot.slotType === 'VIP') {
          iconSymbol = '<tspan fill="#60a5fa"> ♿</tspan>';
        } else if (slot.slotType === 'EV') {
          iconSymbol = '<tspan fill="#34d399"> ⚡</tspan>';
        }

        svgHtml += `
          <g style="cursor:pointer;">
            <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${bg}" stroke="${stroke}" stroke-opacity="${strokeOpacity}" stroke-width="${isUserSlot ? 2 : 1}" rx="4"/>
            <text x="${x + w/2}" y="${y + h/2 + 4}" fill="${textColor}" font-size="${isUserSlot ? 10 : 9}" font-weight="bold" text-anchor="middle">
              ${slot.slotNumber}${iconSymbol}
            </text>
          </g>
        `;
      }
    }
  }

  // DRAW ANIMATED GPS ROUTE PATH
  if (path && path.length > 1) {
    let pathD = '';
    path.forEach((pt, i) => {
      const cx = pt.col * cellW + cellW / 2;
      const cy = pt.row * cellH + cellH / 2;
      pathD += (i === 0 ? `M ${cx} ${cy}` : ` L ${cx} ${cy}`);
    });

    svgHtml += `
      <path d="${pathD}" fill="none" stroke="#f97316" stroke-width="5" stroke-dasharray="10 6" stroke-linecap="round" stroke-linejoin="round" class="gps-route-line" filter="url(#routeGlow)"/>
    `;

    const targetPt = path[path.length - 1];
    const tx = targetPt.col * cellW + cellW / 2;
    const ty = targetPt.row * cellH + cellH / 2;

    svgHtml += `
      <circle cx="${tx}" cy="${ty}" r="12" fill="#f97316" fill-opacity="0.3" stroke="#f97316" stroke-width="2">
        <animate attributeName="r" values="8;16;8" dur="1.5s" repeatCount="indefinite" />
        <animate attributeName="fill-opacity" values="0.6;0.1;0.6" dur="1.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="${tx}" cy="${ty}" r="5" fill="#ffffff" />
    `;
  }

  svgHtml += `</svg>`;
  return svgHtml;
}

  // Display direction guidance
  const directionsContainer = document.getElementById('directionsContainer');
  const directionsSteps = document.getElementById('directionsSteps');
  const directionsDistance = document.getElementById('directionsDistance');

  if (activeSession && directionsContainer && directionsSteps) {
    directionsContainer.classList.remove('hidden');

    if (isAssignedBlock && path) {
      directionsDistance.innerText = `${path.length - 1} steps (${((path.length - 1) * 2.5).toFixed(0)}m)`;
      const steps = generateDirectionSteps(path);
      directionsSteps.innerHTML = '';
      
      steps.forEach((step, index) => {
        const stepEl = document.createElement('div');
        stepEl.className = 'direction-step-item';

        let icon = 'fa-arrow-right';
        if (index === 0) icon = 'fa-door-open';
        else if (index === steps.length - 1) icon = 'fa-square-parking';
        else if (step.desc.includes('LEFT') || step.desc.includes('Left')) icon = 'fa-arrow-left';
        else if (step.desc.includes('RIGHT') || step.desc.includes('Right')) icon = 'fa-arrow-right';
        else if (step.desc.includes('UP') || step.desc.includes('up')) icon = 'fa-arrow-up';
        else if (step.desc.includes('DOWN') || step.desc.includes('down') || step.desc.includes('ahead')) icon = 'fa-arrow-down';

        stepEl.innerHTML = `
          <div class="step-icon-box">
            <i class="fa-solid ${icon}"></i>
          </div>
          <div class="step-text-box">
            <span class="step-text-desc">${step.desc}</span>
            <span class="step-text-sub">${step.sub}</span>
          </div>
        `;
        directionsSteps.appendChild(stepEl);
      });
    } else {
      directionsDistance.innerText = '';
      directionsSteps.innerHTML = `
        <div style="text-align: center; padding: 20px 10px; color: var(--text-muted); font-size: 13px; width: 100%;">
          <i class="fa-solid fa-circle-info" style="font-size: 20px; color: var(--primary); margin-bottom: 8px; display: block;"></i>
          Your assigned slot <strong>${activeSession.assignedSlot.slotNumber}</strong> is on <strong>${activeSession.assignedSlot.floorName}</strong>.<br>
          <button class="btn-primary" style="margin-top: 12px; padding: 8px 16px; font-size: 12px; display: inline-flex;" id="btnSwitchToAssigned">
            Switch to ${activeSession.assignedSlot.floorName} to view path
          </button>
        </div>
      `;
      document.getElementById('btnSwitchToAssigned').addEventListener('click', () => {
        const assignedBlock = activeSession.assignedSlot.block;
        const targetTab = document.querySelector(`.block-tab[data-block="${assignedBlock}"]`);
        if (targetTab) targetTab.click();
      });
    }
  } else {
    if (directionsContainer) directionsContainer.classList.add('hidden');
  }
}

function findPathBFS(gridRows, gridCols, start, target, slotMap) {
  const queue = [[start]];
  const visited = new Set();
  visited.add(`${start.row}_${start.col}`);

  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];

    if (current.row === target.row && current.col === target.col) {
      return path;
    }

    const directions = [
      { r: -1, c: 0 },
      { r: 1, c: 0 },
      { r: 0, c: -1 },
      { r: 0, c: 1 }
    ];

    for (const dir of directions) {
      const nextRow = current.row + dir.r;
      const nextCol = current.col + dir.c;
      const key = `${nextRow}_${nextCol}`;

      if (
        nextRow >= 0 && nextRow < gridRows &&
        nextCol >= 0 && nextCol < gridCols &&
        !visited.has(key)
      ) {
        const isTarget = (nextRow === target.row && nextCol === target.col);
        const isSlot = slotMap.has(key);

        if (!isSlot || isTarget) {
          visited.add(key);
          queue.push([...path, { row: nextRow, col: nextCol }]);
        }
      }
    }
  }
  return null;
}

function generateDirectionSteps(path) {
  if (!path || path.length < 2) return [];

  const steps = [];
  steps.push({
    desc: "Enter the parking facility through the Entrance Gate.",
    sub: "Drive slowly and follow the navigation arrows."
  });

  let currentDir = null; // 'UP', 'DOWN', 'LEFT', 'RIGHT'
  let segmentLength = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const curr = path[i];
    const next = path[i+1];

    let dir = '';
    if (next.row > curr.row) dir = 'DOWN';
    else if (next.row < curr.row) dir = 'UP';
    else if (next.col > curr.col) dir = 'RIGHT';
    else if (next.col < curr.col) dir = 'LEFT';

    if (currentDir === null) {
      currentDir = dir;
      segmentLength = 1;
    } else if (dir === currentDir) {
      segmentLength++;
    } else {
      steps.push(getSegmentDescription(currentDir, segmentLength));
      currentDir = dir;
      segmentLength = 1;
    }
  }

  if (currentDir !== null) {
    steps.push(getSegmentDescription(currentDir, segmentLength));
  }

  steps.push({
    desc: "Arrive at your assigned parking slot.",
    sub: "Park your vehicle securely inside the designated lines."
  });

  return steps;
}

function getSegmentDescription(direction, length) {
  const distance = (length * 2.5).toFixed(0); // 2.5 meters per grid cell
  const unitsText = `${distance}m (${length} cells)`;
  switch (direction) {
    case 'DOWN':
      return { desc: `Go straight ahead for ${unitsText}.`, sub: "Head straight down the driving aisle." };
    case 'UP':
      return { desc: `Go straight up for ${unitsText}.`, sub: "Drive straight up the aisle." };
    case 'RIGHT':
      return { desc: `Turn RIGHT and go straight for ${unitsText}.`, sub: "Follow the lane to the right." };
    case 'LEFT':
      return { desc: `Turn LEFT and go straight for ${unitsText}.`, sub: "Follow the lane to the left." };
  }
}

function startLiveTimer(checkInDate) {
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    const now = new Date();
    const diffMs = now - checkInDate;

    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diffMs % (1000 * 60)) / 1000);

    const pad = (n) => n < 10 ? '0' + n : n;
    document.getElementById('passTimer').innerText = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
  }, 1000);
}

// 100% Mobile & Desktop Reliable PNG Exporter (Blob + Auto-Download)
async function downloadPassPNG() {
  if (!activeSession) return;

  const btn = document.getElementById('btnDownloadPass');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Downloading Pass...';
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 600;
    canvas.height = 700;
    const ctx = canvas.getContext('2d');

    // 1. Pure White Card Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 600, 700);

    // 2. Card Outer Border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, 580, 680);

    // 3. Royal Blue Header Bar
    ctx.fillStyle = '#2563eb';
    ctx.fillRect(40, 40, 520, 60);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('PARKPILOT PARKING PASS', 60, 78);

    // 4. Assigned Slot Box
    ctx.fillStyle = '#eff6ff';
    ctx.fillRect(40, 130, 260, 160);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.strokeRect(40, 130, 260, 160);

    ctx.fillStyle = '#64748b';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('ASSIGNED SLOT', 60, 160);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 52px sans-serif';
    ctx.fillText(activeSession.assignedSlot.slotNumber, 60, 225);

    ctx.fillStyle = '#2563eb';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(activeSession.assignedSlot.floorName, 60, 260);

    // 5. Session Details
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Vehicle Plate:', 40, 380);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(activeSession.session.vehicleNumber, 180, 380);

    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Session ID:', 40, 420);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(activeSession.session.sessionId, 180, 420);

    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Entry Time:', 40, 460);
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(new Date(activeSession.session.checkInTime).toLocaleString(), 180, 460);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText('✓ Validated Dynamic QR Pass', 40, 630);

    ctx.fillStyle = '#64748b';
    ctx.font = '12px sans-serif';
    ctx.fillText('SCAN FOR EXIT GATE RELEASE', 335, 335);

    // 6. Draw Pre-generated QR Data URL onto canvas asynchronously
    const qrImg = new Image();
    qrImg.onload = () => {
      ctx.drawImage(qrImg, 340, 130, 180, 180);
      triggerBlobDownload(canvas, btn, originalText);
    };
    qrImg.onerror = () => {
      triggerBlobDownload(canvas, btn, originalText);
    };
    qrImg.src = activeSession.session.qrDataUrl;

  } catch (err) {
    console.error('[Download PNG Error]', err);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

function triggerBlobDownload(canvas, btn, originalText) {
  try {
    canvas.toBlob((blob) => {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = originalText;
      }

      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `ParkPilot_Pass_${activeSession ? activeSession.assignedSlot.slotNumber : 'Pass'}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      
      setTimeout(() => {
        if (document.body.contains(link)) {
          document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
      }, 1000);
    }, 'image/png');
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}
