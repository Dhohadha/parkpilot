/* ==========================================================================
   PARKPILOT - CLEAN LIGHT PUBLIC WEB APP LOGIC & SESSION PERSISTENCE
   ========================================================================== */

let currentLot = null;
let activeSession = null;
let timerInterval = null;
let socket = null;

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
      document.getElementById('statAvailable').innerText = data.lot.availableSlots;
      document.getElementById('statTotal').innerText = data.lot.totalSlots;
      document.getElementById('statFloors').innerText = data.floors.length;

      if (socket && currentLot) {
        socket.emit('join_lot', currentLot.id);
      }
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

function displaySessionPass(data, triggerAutoDownload = false) {
  activeSession = data;

  document.getElementById('stepCheckIn').classList.remove('active');
  document.getElementById('stepPassView').classList.add('active');

  document.getElementById('passSlotNum').innerText = data.assignedSlot.slotNumber;
  document.getElementById('passFloorNum').innerText = data.assignedSlot.floorName;
  document.getElementById('passVehicle').innerText = data.session.vehicleNumber;
  document.getElementById('passSessionId').innerText = data.session.sessionId;
  document.getElementById('currentFloorTag').innerText = `Floor: ${data.assignedSlot.floorName}`;

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
  if (!activeSession || !activeSession.blueprint) return;

  const { gridRows, gridCols, slots, entrancePos, exitPos } = activeSession.blueprint;
  const gridContainer = document.getElementById('blueprintGrid');
  gridContainer.style.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
  gridContainer.innerHTML = '';

  const slotMap = new Map();
  slots.forEach(s => slotMap.set(`${s.row}_${s.col}`, s));

  for (let r = 0; r < gridRows; r++) {
    for (let c = 0; c < gridCols; c++) {
      const cell = document.createElement('div');
      const key = `${r}_${c}`;

      if (r === entrancePos.row && c === entrancePos.col) {
        cell.className = 'cell-gate';
        cell.innerHTML = '<i class="fa-solid fa-door-open"></i> IN';
      } else if (r === exitPos.row && c === exitPos.col) {
        cell.className = 'cell-gate';
        cell.innerHTML = 'OUT <i class="fa-solid fa-right-from-bracket"></i>';
      } else if (slotMap.has(key)) {
        const slot = slotMap.get(key);
        cell.className = 'cell-slot';

        const isUserSlot = (slot.slotNumber === activeSession.assignedSlot.slotNumber);

        if (isUserSlot) {
          cell.classList.add('status-Allocated');
          cell.innerHTML = `<i class="fa-solid fa-check"></i> ${slot.slotNumber}`;
        } else {
          cell.classList.add(`status-${slot.status}`);
          cell.innerText = slot.slotNumber;
        }
      } else {
        cell.className = 'cell-aisle';
      }

      gridContainer.appendChild(cell);
    }
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
