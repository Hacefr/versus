(function () {
  window._totalsecretcoins = 999;

  if (Array.isArray(window.allLevels)) {
    window.allLevels = window.allLevels.filter(lvl => {
      const id = lvl && lvl[2];
      if (!id || !id.startsWith('level_')) return false;
      const num = parseInt(id.split('_')[1], 10);
      return num >= 1 && num <= 22;
    });
  }

  function getLocalIcon() {
    return {
      player: localStorage.getItem('iconCurrentPlayer') || window.currentPlayer || 'player_01',
      mainColor: (localStorage.getItem('iconMainColor') || '04FF00').replace(/^#/, ''),
      secondaryColor: (localStorage.getItem('iconSecondaryColor') || '00FBFF').replace(/^#/, '')
    };
  }

  let syncTimeout = null;
  function scheduleIconSync() {
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
      const icon = getLocalIcon();
      fetch('/api/sync-icon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(icon)
      }).catch(() => {});
      if (window.VersusSocket && window.VersusSocket.connected) {
        window.VersusSocket.emit('versus:auth', {
          username: window.AccountAPI?.currentUser?.username,
          lastIcon: icon
        });
      }
    }, 250);
  }

  const origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    origSetItem.apply(this, arguments);
    if (key === 'iconCurrentPlayer' || key === 'iconMainColor' || key === 'iconSecondaryColor') {
      scheduleIconSync();
    }
  };

  // --- GD ICON CANVAS RENDERER ---
  const iconAtlasCache = {};
  function hexToRgb(hex) {
    const clean = String(hex || '04FF00').replace(/^#/, '').padStart(6, '0');
    const num = parseInt(clean, 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  function parsePlistNode(el) {
    switch (el.tagName) {
      case 'dict': {
        const o = {};
        const kids = Array.from(el.children);
        for (let i = 0; i + 1 < kids.length; i += 2) o[kids[i].textContent] = parsePlistNode(kids[i + 1]);
        return o;
      }
      case 'array': return Array.from(el.children).map(parsePlistNode);
      case 'integer': return parseInt(el.textContent, 10);
      case 'real': return parseFloat(el.textContent);
      case 'true': return true;
      case 'false': return false;
      default: return el.textContent;
    }
  }
  function plistNums(s) {
    return (String(s).match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  }
  async function loadIconAtlas(playerBase) {
    const base = /^player_\d{2,3}$/.test(playerBase) ? playerBase : 'player_01';
    if (iconAtlasCache[base]) return iconAtlasCache[base];
    const [xmlText, img] = await Promise.all([
      fetch(`assets/icons/${base}-hd.plist`).then(r => r.text()),
      new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = `assets/icons/${base}-hd.png`;
      })
    ]);
    const xml = new DOMParser().parseFromString(xmlText, 'text/xml');
    const plist = parsePlistNode(xml.documentElement.firstElementChild);
    const frames = {};
    for (const name of Object.keys(plist.frames || {})) {
      const d = plist.frames[name];
      const [x, y] = plistNums(d.textureRect || d.frame);
      const [w, h] = plistNums(d.spriteSize || (d.frame ? plistNums(d.frame).slice(2) : [0, 0]));
      const rotated = !!(d.textureRotated || d.rotated);
      const [ox, oy] = plistNums(d.spriteOffset || d.offset || '{0,0}');
      const [srcW, srcH] = plistNums(d.spriteSourceSize || d.sourceSize || `{${w},${h}}`);
      frames[name] = { x, y, w, h, rotated, ox, oy, srcW, srcH };
    }
    iconAtlasCache[base] = { img, frames };
    return iconAtlasCache[base];
  }
  function drawLayer(ctx, img, frame, tintHex, destSize) {
    if (!frame) return;
    const off = document.createElement('canvas');
    off.width = frame.srcW || 60;
    off.height = frame.srcH || 60;
    const octx = off.getContext('2d');
    const sx = Math.round((off.width - frame.w) / 2 + frame.ox);
    const sy = Math.round((off.height - frame.h) / 2 - frame.oy);
    if (frame.rotated) {
      octx.save();
      octx.translate(sx, sy + frame.h);
      octx.rotate(-Math.PI / 2);
      octx.drawImage(img, frame.x, frame.y, frame.h, frame.w, 0, 0, frame.h, frame.w);
      octx.restore();
    } else {
      octx.drawImage(img, frame.x, frame.y, frame.w, frame.h, sx, sy, frame.w, frame.h);
    }
    if (tintHex) {
      const rgb = hexToRgb(tintHex);
      const imgData = octx.getImageData(0, 0, off.width, off.height);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        d[i] = (d[i] * rgb.r) / 255;
        d[i + 1] = (d[i + 1] * rgb.g) / 255;
        d[i + 2] = (d[i + 2] * rgb.b) / 255;
      }
      octx.putImageData(imgData, 0, 0);
    }
    const scale = Math.min(destSize / off.width, destSize / off.height) * 0.88;
    const dw = off.width * scale;
    const dh = off.height * scale;
    ctx.drawImage(off, (destSize - dw) / 2, (destSize - dh) / 2, dw, dh);
  }
  async function renderIcon(canvas, iconData) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const base = (iconData && iconData.player) || 'player_01';
    const c1 = (iconData && iconData.mainColor) || '04FF00';
    const c2 = (iconData && iconData.secondaryColor) || '00FBFF';
    try {
      const atlas = await loadIconAtlas(base);
      drawLayer(ctx, atlas.img, atlas.frames[`${base}_2_001.png`], c2, canvas.width);
      drawLayer(ctx, atlas.img, atlas.frames[`${base}_001.png`], c1, canvas.width);
      drawLayer(ctx, atlas.img, atlas.frames[`${base}_extra_001.png`], 'FFFFFF', canvas.width);
    } catch (e) {}
  }

  // --- VERSUS & GLOBED GHOST STATE ---
  const versusState = {
    activeMatch: false,
    room: null,
    levels: [],
    publicRooms: [],
    myUser: null,
    lastSentPct: -1,
    lastAttempts: 1,
    lastDiedState: false,
    lastGhostEmit: 0,
    opponentGhost: null // { x, y, targetX, targetY, angle, dead, username, lastIcon }
  };
  window.VersusState = versusState;

  const socket = io();
  window.VersusSocket = socket;

  async function initUserAndSocket() {
    let user = null;
    if (window.AccountAPI) {
      user = await window.AccountAPI.checkSession();
    }
    versusState.myUser = user;
    socket.emit('versus:auth', {
      username: user ? user.username : 'Guest_' + Math.floor(1000 + Math.random() * 9000),
      lastIcon: getLocalIcon()
    });
    updateTopBarAccount();
  }

  socket.on('connect', () => initUserAndSocket());

  socket.on('versus:authed', (data) => {
    if (data.user) versusState.myUser = data.user;
    if (data.levels) versusState.levels = data.levels;
    if (data.rooms) versusState.publicRooms = data.rooms;
    updateTopBarAccount();
    renderLobbyModalContent();
  });

  socket.on('versus:rooms_list', (data) => {
    if (data.rooms) versusState.publicRooms = data.rooms;
    if (data.levels) versusState.levels = data.levels;
    renderLobbyModalContent();
  });

  socket.on('versus:room_joined', (room) => {
    versusState.room = room;
    renderLobbyModalContent();
  });

  socket.on('versus:room_updated', (room) => {
    versusState.room = room;
    renderLobbyModalContent();
  });

  socket.on('versus:error', (err) => {
    alert(err.message || 'Versus error');
  });

  socket.on('versus:match_start', (room) => {
    versusState.room = room;
    versusState.activeMatch = true;
    versusState.lastSentPct = 0;
    versusState.lastAttempts = 1;
    versusState.lastDiedState = false;
    versusState.opponentGhost = null;
    closeVersusLobby();
    hideVictoryModal();
    launchMainLevelForVersus(room.level.id);
  });

  socket.on('versus:opponent_ghost', (g) => {
    if (!versusState.activeMatch) return;
    if (!versusState.opponentGhost) {
      versusState.opponentGhost = {
        x: g.x,
        y: g.y,
        targetX: g.x,
        targetY: g.y,
        angle: g.angle || 0,
        dead: g.dead,
        username: g.username,
        lastIcon: g.lastIcon
      };
    } else {
      versusState.opponentGhost.targetX = g.x;
      versusState.opponentGhost.targetY = g.y;
      versusState.opponentGhost.angle = g.angle || 0;
      versusState.opponentGhost.dead = g.dead;
      versusState.opponentGhost.username = g.username;
      versusState.opponentGhost.lastIcon = g.lastIcon;
    }
  });

  socket.on('versus:state_sync', (data) => {
    if (!versusState.room) return;
    versusState.room.players = data.players;
    updateInGameHUD();
  });

  socket.on('versus:match_finished', (room) => {
    versusState.room = room;
    versusState.activeMatch = false;
    versusState.opponentGhost = null;
    if (room.winner && versusState.myUser && room.winner.socketId === socket.id) {
      versusState.myUser.listPoints = room.winner.newTotalPoints;
      updateTopBarAccount();
    }
    updateInGameHUD();
    showVictoryModal(room);
  });

  function launchMainLevelForVersus(levelId) {
    const scene = window._gameScene;
    if (!scene) return;
    window.noClip = false;
    if (scene._practiceMode && scene._practiceMode.isPractice) {
      scene._practiceMode.isPractice = false;
    }
    const found = (window.allLevels || []).find(l => l[2] === levelId) || window.allLevels[0];
    window.currentlevel = found;
    const songID = found[0];
    const levelFileName = found[2];
    const songFileName = found[4] ? found[4] : found[1].replaceAll(' ', '');

    scene.load.text(levelFileName, 'assets/levels/' + levelFileName.split('_')[1] + '.txt');
    scene.load.audio(songID, 'assets/music/' + songFileName + '.mp3');
    scene.load.once('complete', () => {
      if (scene._closeLevelSelect && scene._levelSelectOverlay) {
        try { scene._closeLevelSelect(true); } catch (e) {}
      }
      if (scene._audio) scene._audio.stopMusic();
      scene.input.enabled = true;
      scene.game.registry.set('autoStartGame', true);
      scene.scene.restart();
    });
    scene.load.start();
  }

  // --- UI OVERLAYS ---
  function injectStyles() {
    if (document.getElementById('versus-client-styles')) return;
    const style = document.createElement('style');
    style.id = 'versus-client-styles';
    style.textContent = `
      #wdTopAccountBar {
        position: fixed;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 9000;
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(8, 24, 56, 0.92);
        border: 2px solid #5ce1e6;
        border-radius: 999px;
        padding: 6px 16px;
        font-family: 'Trebuchet MS', Arial, sans-serif;
        color: #fff;
        box-shadow: 0 4px 14px rgba(0,0,0,0.6);
      }
      #wdTopAccountBar a, #wdTopAccountBar button {
        background: linear-gradient(180deg, #88ff2b, #36a300);
        color: #fff;
        font-weight: 900;
        text-decoration: none;
        padding: 5px 12px;
        border-radius: 999px;
        border: 2px solid #fff;
        font-size: 12px;
        cursor: pointer;
        text-shadow: 0 1px 0 #000;
      }
      #wdTopAccountBar .vs-btn { background: linear-gradient(180deg, #ffcc00, #e65c00); }
      #wdVersusLobbyOverlay, #wdVersusVictoryOverlay {
        position: fixed;
        inset: 0;
        background: rgba(2, 8, 24, 0.85);
        z-index: 9500;
        display: none;
        align-items: center;
        justify-content: center;
        font-family: 'Trebuchet MS', Arial, sans-serif;
        color: #fff;
        padding: 16px;
      }
      .vs-modal {
        width: 100%;
        max-width: 800px;
        background: linear-gradient(180deg, #102e63, #071633);
        border: 4px solid #5ce1e6;
        border-radius: 18px;
        padding: 22px;
        box-shadow: 0 15px 40px rgba(0,0,0,0.8);
        max-height: 92vh;
        overflow-y: auto;
      }
      .vs-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 2px solid rgba(255,255,255,0.15);
        padding-bottom: 12px;
        margin-bottom: 16px;
      }
      .vs-header h2 { color: #c1fb3d; font-size: 1.7rem; font-weight: 900; text-shadow: 0 3px 0 #000; }
      .vs-btn-action {
        padding: 10px 18px;
        border-radius: 12px;
        border: 2px solid #fff;
        font-weight: 900;
        font-size: 0.95rem;
        color: #fff;
        cursor: pointer;
        text-shadow: 0 2px 0 #000;
        text-transform: uppercase;
      }
      .vs-green { background: linear-gradient(180deg, #88ff2b, #36a300); }
      .vs-blue { background: linear-gradient(180deg, #38d6ff, #0066cc); }
      .vs-orange { background: linear-gradient(180deg, #ffcc00, #e65c00); }
      .vs-red { background: linear-gradient(180deg, #ff5e5e, #b30000); }
      .vs-players-cards {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 14px;
        align-items: center;
        margin: 18px 0;
      }
      .vs-pcard {
        background: rgba(0,0,0,0.45);
        border: 2px solid rgba(92,225,230,0.5);
        border-radius: 14px;
        padding: 16px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        text-align: center;
      }
      .vs-room-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(0,0,0,0.4);
        border: 1px solid rgba(255,255,255,0.2);
        border-radius: 10px;
        padding: 10px 14px;
        margin-bottom: 8px;
      }
      #wdVersusHUD {
        position: fixed;
        top: 48px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 8900;
        width: min(650px, 94vw);
        background: rgba(5, 14, 35, 0.85);
        border: 2px solid #5ce1e6;
        border-radius: 12px;
        padding: 8px 14px;
        font-family: 'Trebuchet MS', Arial, sans-serif;
        color: #fff;
        display: none;
        pointer-events: none;
      }
      .hud-rule-tag {
        text-align: center;
        font-size: 11px;
        font-weight: 900;
        color: #c1fb3d;
        margin-bottom: 4px;
        text-transform: uppercase;
      }
      .hud-p-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 4px 0;
        font-size: 12px;
        font-weight: 900;
      }
      .hud-name { width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hud-bar-bg {
        flex: 1;
        height: 12px;
        background: rgba(255,255,255,0.12);
        border-radius: 999px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.3);
      }
      .hud-bar-fill { height: 100%; width: 0%; transition: width 0.08s linear; }
      .hud-pct { width: 105px; text-align: right; color: #ffd700; }
    `;
    document.head.appendChild(style);
  }

  function createDOMElements() {
    injectStyles();
    if (!document.getElementById('wdTopAccountBar')) {
      const bar = document.createElement('div');
      bar.id = 'wdTopAccountBar';
      bar.innerHTML = `
        <a href="/">← Portal & Leaderboards</a>
        <span id="wdBarUsername" style="font-weight:900;">Guest</span>
        <span id="wdBarPoints" style="color:#ffd700; font-weight:900;">★ 0 pts</span>
        <button class="vs-btn" onclick="window.openVersusLobby()">⚔ 1v1 VERSUS</button>
      `;
      document.body.appendChild(bar);
    }
    if (!document.getElementById('wdVersusLobbyOverlay')) {
      const lob = document.createElement('div');
      lob.id = 'wdVersusLobbyOverlay';
      lob.innerHTML = `<div class="vs-modal" id="wdVersusLobbyContent"></div>`;
      document.body.appendChild(lob);
    }
    if (!document.getElementById('wdVersusVictoryOverlay')) {
      const vic = document.createElement('div');
      vic.id = 'wdVersusVictoryOverlay';
      vic.innerHTML = `<div class="vs-modal" id="wdVersusVictoryContent" style="max-width:500px; text-align:center;"></div>`;
      document.body.appendChild(vic);
    }
    if (!document.getElementById('wdVersusHUD')) {
      const hud = document.createElement('div');
      hud.id = 'wdVersusHUD';
      hud.innerHTML = `
        <div class="hud-rule-tag" id="hudRuleTag">RULE: STANDARD RACE</div>
        <div class="hud-p-row">
          <span class="hud-name" id="hudMyName">YOU</span>
          <div class="hud-bar-bg"><div class="hud-bar-fill" id="hudMyFill" style="background:#88ff2b;"></div></div>
          <span class="hud-pct" id="hudMyPct">0%</span>
        </div>
        <div class="hud-p-row">
          <span class="hud-name" id="hudOppName">OPPONENT</span>
          <div class="hud-bar-bg"><div class="hud-bar-fill" id="hudOppFill" style="background:#ff4d4d;"></div></div>
          <span class="hud-pct" id="hudOppPct">0%</span>
        </div>
      `;
      document.body.appendChild(hud);
    }
  }

  function updateTopBarAccount() {
    createDOMElements();
    const u = versusState.myUser;
    const nameEl = document.getElementById('wdBarUsername');
    const ptsEl = document.getElementById('wdBarPoints');
    if (nameEl && u) nameEl.textContent = u.username;
    if (ptsEl && u) ptsEl.textContent = `★ ${u.listPoints || 0} List Pts`;
  }

  window.openVersusLobby = function () {
    createDOMElements();
    socket.emit('versus:list_rooms');
    document.getElementById('wdVersusLobbyOverlay').style.display = 'flex';
    renderLobbyModalContent();
  };

  function closeVersusLobby() {
    const el = document.getElementById('wdVersusLobbyOverlay');
    if (el) el.style.display = 'none';
  }
  window.closeVersusLobby = closeVersusLobby;

  function renderLobbyModalContent() {
    const container = document.getElementById('wdVersusLobbyContent');
    if (!container) return;

    const room = versusState.room;
    const levels = versusState.levels || [];

    if (!room) {
      const roomsHtml = (versusState.publicRooms || []).length === 0
        ? `<div style="text-align:center; padding:18px; color:#9be8ff;">No open public rooms right now. Click <b>Create 1v1 Room</b> to host one!</div>`
        : versusState.publicRooms.map(r => `
            <div class="vs-room-row">
              <div>
                <div style="font-weight:900; font-size:1.05rem;">${r.hostName} <span style="color:#ffd700;">(★ ${r.hostPoints} pts)</span></div>
                <div style="font-size:0.85rem; color:#9be8ff;">Level: <b>${r.levelName}</b> (${r.difficulty}) · <span style="color:#c1fb3d;">+${r.points} List Points</span></div>
                <div style="font-size:0.8rem; color:#ffcc00;">Rule: ${r.ruleName || 'Standard Race'}</div>
              </div>
              <button class="vs-btn-action vs-green" onclick="window.VersusSocket.emit('versus:join_room', { roomId: '${r.id}' })">JOIN 1v1</button>
            </div>
          `).join('');

      container.innerHTML = `
        <div class="vs-header">
          <h2>⚔ 1v1 VERSUS & GLOBED LOBBY</h2>
          <button class="vs-btn-action vs-red" onclick="window.closeVersusLobby()">✕ Close</button>
        </div>

        <div style="display:flex; flex-wrap:wrap; gap:12px; margin-bottom:20px; justify-content:space-between; align-items:center;">
          <div style="display:flex; gap:10px;">
            <button class="vs-btn-action vs-green" onclick="window.VersusSocket.emit('versus:create_room', { levelId: 'level_1', isPublic: true })">+ Create Public 1v1 Room</button>
            <button class="vs-btn-action vs-blue" onclick="window.VersusSocket.emit('versus:create_room', { levelId: 'level_1', isPublic: false })">🔒 Create Private Room</button>
          </div>
          <div style="display:flex; gap:8px;">
            <input id="joinCodeInput" placeholder="Room Code..." maxlength="6" style="padding:10px; border-radius:10px; border:2px solid #5ce1e6; background:#000; color:#fff; font-weight:900; width:130px; text-transform:uppercase;" />
            <button class="vs-btn-action vs-orange" onclick="window.VersusSocket.emit('versus:join_room', { roomId: document.getElementById('joinCodeInput').value })">Join Code</button>
          </div>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <h3 style="color:#ffd700;">OPEN 1v1 ROOMS</h3>
          <button class="vs-btn-action vs-blue" style="padding:6px 12px; font-size:0.8rem;" onclick="window.VersusSocket.emit('versus:list_rooms')">↻ Refresh</button>
        </div>
        <div>${roomsHtml}</div>
      `;
    } else {
      const isHost = room.hostId === socket.id;
      const p1 = room.players[0];
      const p2 = room.players[1] || null;

      const levelOptions = levels.map(l => `
        <option value="${l.id}" ${l.id === room.level.id ? 'selected' : ''}>
          ${l.name} (${l.difficulty}) — +${l.points} List Points
        </option>
      `).join('');

      const ruleOptions = [
        { id: 'race', label: 'First to 100% (Standard Race)' },
        { id: 'min_attempts', label: 'Min Attempts (Fewest Attempts at 100% Wins)' },
        { id: 'max_attempts_4', label: 'Max 4 Attempts (Furthest % in 4 Attempts Wins)' }
      ].map(r => `<option value="${r.id}" ${r.id === room.ruleMode ? 'selected' : ''}>${r.label}</option>`).join('');

      container.innerHTML = `
        <div class="vs-header">
          <h2>⚔ 1v1 ROOM CODE: <span style="color:#ffd700;">${room.id}</span></h2>
          <button class="vs-btn-action vs-red" onclick="window.VersusSocket.emit('versus:leave_room'); window.VersusState.room = null; window.openVersusLobby();">Leave Room</button>
        </div>

        <div style="background:rgba(0,0,0,0.4); border:2px solid #ffd700; border-radius:12px; padding:14px; text-align:center; margin-bottom:14px;">
          <div style="font-size:0.9rem; color:#9be8ff; font-weight:800;">MAIN LEVEL & HOST RULES (GLOBED GHOST ENABLED)</div>
          <div style="font-size:1.45rem; font-weight:900; color:#fff; margin:4px 0;">
            ${room.level.name} <span style="color:#c1fb3d;">(+${room.level.points} List Points)</span>
          </div>
          <div style="font-size:0.95rem; font-weight:900; color:#ffcc00; margin-bottom:6px;">
            Rule: ${room.ruleName} — <span style="color:#ddd; font-weight:700;">${room.ruleDesc}</span>
          </div>
          ${isHost ? `
            <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin-top:10px;">
              <select onchange="window.VersusSocket.emit('versus:change_level', { levelId: this.value })" style="padding:8px 12px; border-radius:8px; background:#081c44; color:#fff; border:2px solid #5ce1e6; font-weight:900;">
                ${levelOptions}
              </select>
              <select onchange="window.VersusSocket.emit('versus:change_rule', { ruleMode: this.value })" style="padding:8px 12px; border-radius:8px; background:#081c44; color:#ffcc00; border:2px solid #ffcc00; font-weight:900;">
                ${ruleOptions}
              </select>
            </div>
          ` : `<div style="font-size:0.85rem; color:#aaa;">Host is configuring level & rules...</div>`}
        </div>

        <div class="vs-players-cards">
          <div class="vs-pcard">
            <canvas id="vsRoomP1Icon" width="60" height="60"></canvas>
            <div style="font-size:1.25rem; font-weight:900;">${p1 ? p1.username : 'Waiting...'}</div>
            <div style="color:#ffd700; font-weight:900;">★ ${p1 ? p1.listPoints : 0} List Points</div>
          </div>

          <div style="font-size:2.2rem; font-weight:900; color:#ff9900; text-shadow:0 3px 0 #000;">VS</div>

          <div class="vs-pcard">
            <canvas id="vsRoomP2Icon" width="60" height="60"></canvas>
            <div style="font-size:1.25rem; font-weight:900;">${p2 ? p2.username : 'Waiting for Opponent...'}</div>
            <div style="color:#ffd700; font-weight:900;">${p2 ? `★ ${p2.listPoints} List Points` : 'Share Room Code: ' + room.id}</div>
          </div>
        </div>

        <div style="text-align:center; margin-top:16px;">
          ${isHost ? `
            <button class="vs-btn-action vs-green" style="font-size:1.25rem; padding:14px 36px; ${!p2 ? 'opacity:0.5;' : ''}" onclick="window.VersusSocket.emit('versus:start_match')">
              ${p2 ? '▶ START 1v1 VERSUS MATCH!' : 'Waiting for Player 2...'}
            </button>
          ` : `
            <div style="font-size:1.1rem; font-weight:900; color:#c1fb3d;">Ready! Waiting for Host to start the match...</div>
          `}
        </div>
      `;

      if (p1) renderIcon(document.getElementById('vsRoomP1Icon'), p1.lastIcon);
      if (p2) renderIcon(document.getElementById('vsRoomP2Icon'), p2.lastIcon);
    }
  }

  function updateInGameHUD() {
    const hud = document.getElementById('wdVersusHUD');
    if (!hud) return;
    if (!versusState.activeMatch || !versusState.room) {
      hud.style.display = 'none';
      return;
    }
    hud.style.display = 'block';
    const ruleTag = document.getElementById('hudRuleTag');
    if (ruleTag) {
      ruleTag.textContent = `⚔ ${versusState.room.ruleName} · GLOBED GHOST ACTIVE`;
    }
    const players = versusState.room.players || [];
    const me = players.find(p => p.socketId === socket.id) || players[0];
    const opp = players.find(p => p.socketId !== socket.id) || players[1];
    const isMax4 = versusState.room.ruleMode === 'max_attempts_4';

    if (me) {
      const attLabel = isMax4 ? `${Math.min(me.attempts || 1, 4)}/4` : `${me.attempts || 1}`;
      document.getElementById('hudMyName').textContent = `${me.username} (Att ${attLabel})`;
      document.getElementById('hudMyFill').style.width = `${me.percent || 0}%`;
      document.getElementById('hudMyFill').style.background = '#' + ((me.lastIcon && me.lastIcon.mainColor) || '88ff2b');
      document.getElementById('hudMyPct').textContent = `${Math.floor(me.percent || 0)}% (Best ${Math.floor(me.bestPercent || 0)}%)`;
    }
    if (opp) {
      const attLabel = isMax4 ? `${Math.min(opp.attempts || 1, 4)}/4` : `${opp.attempts || 1}`;
      document.getElementById('hudOppName').textContent = `${opp.username} (Att ${attLabel})`;
      document.getElementById('hudOppFill').style.width = `${opp.percent || 0}%`;
      document.getElementById('hudOppFill').style.background = '#' + ((opp.lastIcon && opp.lastIcon.mainColor) || 'ff4d4d');
      document.getElementById('hudOppPct').textContent = `${Math.floor(opp.percent || 0)}% (Best ${Math.floor(opp.bestPercent || 0)}%)`;
    }
  }

  function showVictoryModal(room) {
    const ov = document.getElementById('wdVersusVictoryOverlay');
    const content = document.getElementById('wdVersusVictoryContent');
    if (!ov || !content || !room.winner) return;

    const iWon = room.winner.socketId === socket.id;
    content.innerHTML = `
      <h2 style="font-size:2.2rem; color:${iWon ? '#88ff2b' : '#ff5e5e'}; text-shadow:0 3px 0 #000; margin-bottom:8px;">
        ${iWon ? '🏆 VICTORY!' : '💀 DEFEAT!'}
      </h2>
      <div style="font-size:1.15rem; font-weight:900; margin-bottom:12px;">
        ${room.winner.reasonText || `${room.winner.username} won on ${room.winner.levelName}!`}
      </div>
      <div style="background:rgba(0,0,0,0.5); border:2px solid #ffd700; border-radius:12px; padding:14px; margin:16px 0;">
        <div style="color:#ffd700; font-size:1.4rem; font-weight:900;">
          ${iWon ? `+${room.winner.pointsAwarded} LIST POINTS!` : '+0 List Points'}
        </div>
        <div style="font-size:0.9rem; color:#9be8ff; margin-top:4px;">
          Winner Total: ★ ${room.winner.newTotalPoints} List Points
        </div>
      </div>
      <div style="display:flex; gap:12px; justify-content:center; margin-top:16px;">
        <button class="vs-btn-action vs-green" onclick="window.backToVersusRoom()">Return to 1v1 Room</button>
        <button class="vs-btn-action vs-blue" onclick="window.hideVictoryModal()">Keep Practicing</button>
      </div>
    `;
    ov.style.display = 'flex';
  }

  function hideVictoryModal() {
    const ov = document.getElementById('wdVersusVictoryOverlay');
    if (ov) ov.style.display = 'none';
  }
  window.hideVictoryModal = hideVictoryModal;

  window.backToVersusRoom = function () {
    hideVictoryModal();
    window.openVersusLobby();
  };

  // --- HOOK PHASER GAMESCENE + GLOBED REAL-TIME GHOST ---
  function installGameSceneHooks() {
    if (typeof GameScene === 'undefined') {
      setTimeout(installGameSceneHooks, 100);
      return;
    }

    const origCreate = GameScene.prototype.create;
    GameScene.prototype.create = function () {
      window._gameScene = this;
      origCreate.apply(this, arguments);

      if (this._socialIcons) this._socialIcons.forEach(ic => ic && ic.setVisible(false));
      if (this._tryMeImg) this._tryMeImg.setVisible(false);
      if (this._downloadBtns) this._downloadBtns.forEach(b => b && b.setVisible(false));
      if (this._menuAchievementsBtn) this._menuAchievementsBtn.setVisible(false);
      if (this._menuNewgroundsBtn) this._menuNewgroundsBtn.setVisible(false);

      this._openCreatorMenu = () => window.openVersusLobby();

      if (this._menuActive && this._playBtn && this._creatorBtn) {
        this._practiceModeTag = this.add.bitmapText(this._playBtn.x, this._playBtn.y - 115, 'goldFont', 'SOLO PRACTICE', 24)
          .setOrigin(0.5).setScrollFactor(0).setDepth(35);
        this._versusModeTag = this.add.bitmapText(this._creatorBtn.x, this._creatorBtn.y - 95, 'goldFont', '1v1 VERSUS', 24)
          .setOrigin(0.5).setScrollFactor(0).setDepth(35);
        if (this._iconBtn) {
          this._iconKitTag = this.add.bitmapText(this._iconBtn.x, this._iconBtn.y - 95, 'bigFont', 'ICON KIT', 20)
            .setOrigin(0.5).setScrollFactor(0).setDepth(35);
        }
      }

      // Create Globed Ghost Graphics & Label inside Phaser Scene
      this._globedGhostGfx = this.add.graphics().setScrollFactor(0).setDepth(48).setVisible(false);
      this._globedGhostLabel = this.add.bitmapText(0, 0, 'bigFont', '', 16)
        .setOrigin(0.5, 1).setScrollFactor(0).setDepth(49).setAlpha(0.85).setVisible(false);

      createDOMElements();
      updateInGameHUD();
    };

    const origStartGame = GameScene.prototype._startGame;
    GameScene.prototype._startGame = function () {
      if (this._practiceModeTag) { this._practiceModeTag.destroy(); this._practiceModeTag = null; }
      if (this._versusModeTag) { this._versusModeTag.destroy(); this._versusModeTag = null; }
      if (this._iconKitTag) { this._iconKitTag.destroy(); this._iconKitTag = null; }
      origStartGame.apply(this, arguments);
    };

    const origPositionMenu = GameScene.prototype._positionMenuItems;
    GameScene.prototype._positionMenuItems = function () {
      origPositionMenu.apply(this, arguments);
      if (this._socialIcons) this._socialIcons.forEach(ic => ic && ic.setVisible(false));
      if (this._tryMeImg) this._tryMeImg.setVisible(false);
      if (this._downloadBtns) this._downloadBtns.forEach(b => b && b.setVisible(false));
      if (this._practiceModeTag && this._playBtn) this._practiceModeTag.setPosition(this._playBtn.x, this._playBtn.y - 115);
      if (this._versusModeTag && this._creatorBtn) this._versusModeTag.setPosition(this._creatorBtn.x, this._creatorBtn.y - 95);
      if (this._iconKitTag && this._iconBtn) this._iconKitTag.setPosition(this._iconBtn.x, this._iconBtn.y - 95);
    };

    const origUpdate = GameScene.prototype.update;
    GameScene.prototype.update = function (time, delta) {
      origUpdate.apply(this, arguments);

      const topBar = document.getElementById('wdTopAccountBar');
      if (topBar) topBar.style.display = this._menuActive ? 'flex' : 'none';

      if (versusState.activeMatch && !this._menuActive && this._level && this._level.endXPos > 0) {
        if (window.noClip) window.noClip = false;

        let rawPct = (this._playerWorldX / this._level.endXPos) * 100;
        rawPct = Math.min(100, Math.max(0, rawPct));
        if (this._levelWon) rawPct = 100;

        const rounded = Math.floor(rawPct);
        const attempts = this._levelAttempts || 1;
        const isDead = !!(this._state && this._state.isDead);

        if (rounded !== versusState.lastSentPct || attempts !== versusState.lastAttempts || isDead !== versusState.lastDiedState) {
          versusState.lastSentPct = rounded;
          versusState.lastAttempts = attempts;
          versusState.lastDiedState = isDead;
          socket.emit('versus:progress', {
            percent: rounded,
            attempts: attempts,
            died: isDead
          });
        }

        // 1. EMIT MY GLOBED GHOST POSITION (30Hz)
        const now = performance.now();
        if (now - versusState.lastGhostEmit >= 33 && this._state) {
          versusState.lastGhostEmit = now;
          const spr = this._player && this._player._playerSpriteLayer && this._player._playerSpriteLayer.sprite;
          socket.emit('versus:ghost', {
            x: Math.round(this._playerWorldX),
            y: Math.round(this._state.y || 30),
            angle: spr ? Math.round(spr.angle || 0) : 0,
            dead: isDead
          });
        }

        // 2. RENDER OPPONENT'S GLOBED GHOST IN REAL TIME
        const g = versusState.opponentGhost;
        if (g && this._globedGhostGfx && this._globedGhostLabel && !g.dead) {
          g.x += (g.targetX - g.x) * 0.35;
          g.y += (g.targetY - g.y) * 0.35;

          const screenX = g.x - this._cameraX;
          const screenY = (typeof b === 'function' ? b(g.y) : (460 - g.y)) - this._cameraY;

          if (screenX >= -100 && screenX <= screenWidth + 100) {
            const c1 = parseInt((g.lastIcon && g.lastIcon.mainColor) || 'FF4D4D', 16);
            const c2 = parseInt((g.lastIcon && g.lastIcon.secondaryColor) || 'FFFF00', 16);

            this._globedGhostGfx.clear();
            this._globedGhostGfx.setVisible(true);

            // Draw rotated translucent GD Ghost Cube at opponent's exact coordinates
            const rad = (g.angle || 0) * (Math.PI / 180);
            const cos = Math.cos(rad), sin = Math.sin(rad);
            const rotPt = (lx, ly) => ({
              x: screenX + (lx * cos - ly * sin),
              y: screenY + (lx * sin + ly * cos)
            });

            // Outer primary cube (size 54x54)
            const h1 = 26;
            const pA = rotPt(-h1, -h1), pB = rotPt(h1, -h1), pC = rotPt(h1, h1), pD = rotPt(-h1, h1);
            this._globedGhostGfx.fillStyle(c1, 0.48);
            this._globedGhostGfx.lineStyle(3, 0xffffff, 0.65);
            this._globedGhostGfx.beginPath();
            this._globedGhostGfx.moveTo(pA.x, pA.y);
            this._globedGhostGfx.lineTo(pB.x, pB.y);
            this._globedGhostGfx.lineTo(pC.x, pC.y);
            this._globedGhostGfx.lineTo(pD.x, pD.y);
            this._globedGhostGfx.closePath();
            this._globedGhostGfx.fillPath();
            this._globedGhostGfx.strokePath();

            // Inner secondary core (size 26x26)
            const h2 = 13;
            const qA = rotPt(-h2, -h2), qB = rotPt(h2, -h2), qC = rotPt(h2, h2), qD = rotPt(-h2, h2);
            this._globedGhostGfx.fillStyle(c2, 0.6);
            this._globedGhostGfx.beginPath();
            this._globedGhostGfx.moveTo(qA.x, qA.y);
            this._globedGhostGfx.lineTo(qB.x, qB.y);
            this._globedGhostGfx.lineTo(qC.x, qC.y);
            this._globedGhostGfx.lineTo(qD.x, qD.y);
            this._globedGhostGfx.closePath();
            this._globedGhostGfx.fillPath();

            this._globedGhostLabel.setText(g.username || 'Opponent');
            this._globedGhostLabel.setPosition(screenX, screenY - 36);
            this._globedGhostLabel.setVisible(true);
          } else {
            this._globedGhostGfx.setVisible(false);
            this._globedGhostLabel.setVisible(false);
          }
        } else if (this._globedGhostGfx && this._globedGhostLabel) {
          this._globedGhostGfx.setVisible(false);
          this._globedGhostLabel.setVisible(false);
        }
      } else if (this._globedGhostGfx && this._globedGhostLabel) {
        this._globedGhostGfx.setVisible(false);
        this._globedGhostLabel.setVisible(false);
      }
    };
  }

  installGameSceneHooks();
})();
