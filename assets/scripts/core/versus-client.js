(function () {
  window._totalsecretcoins = 999;

  // Prevent Web Dashers from ever auto-popping the "NEWS" / Update Log modal
  try {
    localStorage.setItem('gd_lastSeenUpdateLog', '999999');
    localStorage.setItem('lastSeenUpdateLog', '999999');
    localStorage.setItem('updateLogSeen', 'true');
    localStorage.setItem('newsSeen', 'true');
  } catch (e) {}

  function getBrowserId() {
    let bId = localStorage.getItem('wd_browser_id');
    if (!bId) {
      const m = document.cookie.match(/(?:^|;\s*)wd_browser_id=([^;]+)/);
      bId = m ? m[1] : ('b_' + Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem('wd_browser_id', bId);
    }
    return bId;
  }

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
          username: versusState.myUser?.username,
          browserId: getBrowserId(),
          lastIcon: icon
        });
      }
      if (versusState.myUser) {
        versusState.myUser.lastIcon = icon;
        refreshMainHubProfile();
      }
    }, 200);
  }

  const origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    origSetItem.apply(this, arguments);
    if (key === 'iconCurrentPlayer' || key === 'iconMainColor' || key === 'iconSecondaryColor') {
      scheduleIconSync();
    }
  };

  // --- MOBILE FULLSCREEN + LANDSCAPE ORIENTATION LOCK HELPER ---
  window.toggleClientFullscreenAndLock = async function () {
    try {
      const docEl = document.documentElement;
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        if (docEl.requestFullscreen) await docEl.requestFullscreen();
        else if (docEl.webkitRequestFullscreen) await docEl.webkitRequestFullscreen();
      }
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape').catch(() => {});
      }
    } catch (e) {}
  };

  // --- GD DIFFICULTY FACE + RING RENDERER (GJ_GameSheet03.png) ---
  const SHEET03_COORDS = {
    'diffIcon_01_btn_001.png': { x: 1886, y: 977,  w: 60, h: 60 },
    'diffIcon_02_btn_001.png': { x: 1886, y: 1038, w: 60, h: 60 },
    'diffIcon_03_btn_001.png': { x: 1886, y: 1099, w: 60, h: 60 },
    'diffIcon_04_btn_001.png': { x: 1886, y: 1160, w: 60, h: 60 },
    'diffIcon_05_btn_001.png': { x: 1886, y: 1221, w: 60, h: 60 },
    'diffIcon_06_btn_001.png': { x: 1447, y: 1747, w: 67, h: 62 },
    'diffIcon_07_btn_001.png': { x: 1825, y: 67,   w: 66, h: 61 },
    'diffIcon_10_btn_001.png': { x: 728,  y: 1670, w: 80, h: 67 },
    'GJ_featuredCoin_001.png': { x: 1654, y: 562,  w: 82, h: 84 },
    'GJ_epicCoin_001.png':     { x: 384,  y: 1482, w: 97, h: 97 }
  };
  let sheet03Promise = null;
  function getSheet03() {
    if (!sheet03Promise) {
      sheet03Promise = new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = rej;
        i.src = 'assets/sheets/GJ_GameSheet03.png';
      });
    }
    return sheet03Promise;
  }
  async function renderRankBadge(canvas, rankInfo) {
    if (!canvas || !rankInfo) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    try {
      const img = await getSheet03();
      const cw = canvas.width, ch = canvas.height;
      if (rankInfo.ring === 2) {
        const r = SHEET03_COORDS['GJ_epicCoin_001.png'];
        const scale = Math.min(cw / r.w, ch / r.h) * 0.98;
        const dw = r.w * scale, dh = r.h * scale;
        ctx.drawImage(img, r.x, r.y, r.w, r.h, (cw - dw) / 2, (ch - dh) / 2 - 2, dw, dh);
      } else if (rankInfo.ring === 1) {
        const r = SHEET03_COORDS['GJ_featuredCoin_001.png'];
        const scale = Math.min(cw / r.w, ch / r.h) * 0.88;
        const dw = r.w * scale, dh = r.h * scale;
        ctx.drawImage(img, r.x, r.y, r.w, r.h, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      }
      const f = SHEET03_COORDS[rankInfo.face] || SHEET03_COORDS['diffIcon_01_btn_001.png'];
      const fScale = (cw * 0.62) / Math.max(f.w, f.h);
      const fw = f.w * fScale, fh = f.h * fScale;
      ctx.drawImage(img, f.x, f.y, f.w, f.h, (cw - fw) / 2, (ch - fh) / 2 + (rankInfo.ring === 2 ? 3 : 0), fw, fh);
    } catch (e) {}
  }

  // --- GD CUBE ICON RENDERER ---
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

  // --- STATE & SOCKET ---
  const versusState = {
    engineReady: false,
    activeMatch: false,
    inQueue: false,
    queueIsRanked: false,
    rankedInQueue: 0,
    unrankedInQueue: 0,
    room: null,
    levels: [],
    publicRooms: [],
    myUser: null,
    authMode: 'login',
    lbTab: 'ranked',
    cachedLb: { rankedLeaderboard: [], unrankedLeaderboard: [] },
    lastSentPct: -1,
    lastAttempts: 1,
    lastDiedState: false,
    jumpsCount: 0,
    prevUpKeyDown: false,
    lastGhostEmit: 0,
    opponentGhost: null,
    rotateDismissed: false
  };
  window.VersusState = versusState;

  const socket = io();
  window.VersusSocket = socket;

  async function initUserAndSocket() {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        versusState.myUser = data.user;
        if (window.AccountAPI) window.AccountAPI.currentUser = data.user;
        if (data.browserId) localStorage.setItem('wd_browser_id', data.browserId);
      } else {
        versusState.myUser = null;
      }
    } catch (e) {
      versusState.myUser = null;
    }

    socket.emit('versus:auth', {
      username: versusState.myUser ? versusState.myUser.username : ('Guest_' + Math.floor(1000 + Math.random() * 9000)),
      browserId: getBrowserId(),
      lastIcon: getLocalIcon()
    });
    refreshMainHubUI();
  }

  socket.on('connect', () => initUserAndSocket());

  socket.on('versus:authed', (data) => {
    if (data.user && versusState.myUser) {
      versusState.myUser = Object.assign(versusState.myUser, data.user);
    }
    if (data.levels) versusState.levels = data.levels;
    if (data.rooms) versusState.publicRooms = data.rooms;
    if (data.rankedInQueue !== undefined) versusState.rankedInQueue = data.rankedInQueue;
    if (data.unrankedInQueue !== undefined) versusState.unrankedInQueue = data.unrankedInQueue;
    refreshMainHubUI();
    renderLobbyModalContent();
  });

  socket.on('versus:queue_status', (data) => {
    versusState.inQueue = !!data.inQueue;
    versusState.queueIsRanked = !!data.isRanked;
    renderLobbyModalContent();
  });

  socket.on('versus:queue_counts', (data) => {
    versusState.rankedInQueue = data.rankedInQueue || 0;
    versusState.unrankedInQueue = data.unrankedInQueue || 0;
    renderLobbyModalContent();
  });

  socket.on('versus:rooms_list', (data) => {
    if (data.rooms) versusState.publicRooms = data.rooms;
    if (data.levels) versusState.levels = data.levels;
    if (data.rankedInQueue !== undefined) versusState.rankedInQueue = data.rankedInQueue;
    if (data.unrankedInQueue !== undefined) versusState.unrankedInQueue = data.unrankedInQueue;
    renderLobbyModalContent();
  });

  socket.on('versus:room_joined', (room) => {
    versusState.inQueue = false;
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
    versusState.inQueue = false;
    versusState.room = room;
    versusState.activeMatch = true;
    versusState.lastSentPct = 0;
    versusState.lastAttempts = 1;
    versusState.lastDiedState = false;
    versusState.jumpsCount = 0;
    versusState.opponentGhost = null;
    closeVersusLobby();
    hideVictoryModal();
    closeLeaderboardModal();
    launchMainLevelForVersus(room.level.id);
  });

  socket.on('versus:opponent_ghost', (g) => {
    if (!versusState.activeMatch) return;
    if (!versusState.opponentGhost) {
      versusState.opponentGhost = {
        x: g.x, y: g.y, targetX: g.x, targetY: g.y,
        angle: g.angle || 0, dead: g.dead,
        username: g.username, lastIcon: g.lastIcon
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
      if (room.isRanked) {
        versusState.myUser.rankedPoints = room.winner.newTotalPoints;
        versusState.myUser.rankInfo = room.winner.rankInfo;
      } else {
        versusState.myUser.unrankedPoints = room.winner.newTotalPoints;
      }
      refreshMainHubProfile();
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

  // --- TRIGGER ENGINE FEATURES FROM OUR CUSTOM CLIENT ---
  window.openSoloPractice = function () {
    const scene = window._gameScene;
    if (!scene) return;
    if (scene._newsPopup && scene._closeNewsPopup) {
      try { scene._closeNewsPopup(); } catch (e) {}
    }
    scene._openLevelSelect();
  };

  window.openCharacterEditor = function () {
    const scene = window._gameScene;
    if (!scene) return;
    if (scene._newsPopup && scene._closeNewsPopup) {
      try { scene._closeNewsPopup(); } catch (e) {}
    }
    if (typeof scene._triggerGarageOpen === 'function') {
      scene._triggerGarageOpen();
    }
  };

  window.openGameSettings = function () {
    const scene = window._gameScene;
    if (!scene) return;
    if (typeof scene._showSettingsScreen === 'function') {
      scene._showSettingsScreen();
    }
  };

  // --- FULL-SCREEN OPAQUE CUSTOM CLIENT STYLES + MOBILE LANDSCAPE LOCK & RESPONSIVE UI ---
  function injectStyles() {
    if (document.getElementById('versus-client-styles')) return;
    const style = document.createElement('style');
    style.id = 'versus-client-styles';
    style.textContent = `
      html, body {
        touch-action: manipulation;
        overscroll-behavior: none;
        -webkit-user-select: none;
        user-select: none;
      }
      /* Mobile Portrait Rotate / Lock Screen */
      #wdMobileLockOverlay {
        position: fixed;
        inset: 0;
        z-index: 10000;
        background: #041028 url('assets/sprites/game_bg_01_001.png') repeat-x center bottom;
        background-size: cover;
        display: none;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
        text-align: center;
        font-family: 'Pusab', 'Trebuchet MS', 'Arial Black', sans-serif;
        color: #fff;
        text-shadow: 0 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000;
      }
      @media screen and (max-width: 900px) and (orientation: portrait) {
        #wdMobileLockOverlay.active-lock {
          display: flex !important;
        }
      }
      #wdMainHubOverlay {
        position: fixed;
        inset: 0;
        z-index: 8500;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 12px;
        background: #051638 url('assets/sprites/game_bg_01_001.png') repeat-x center bottom;
        background-size: cover;
        font-family: 'Pusab', 'Trebuchet MS', 'Arial Black', sans-serif;
        color: #fff;
        text-shadow: 0 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000;
        pointer-events: auto;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      #wdMainHubOverlay::before {
        content: '';
        position: fixed;
        inset: 0;
        background: radial-gradient(circle at 50% 30%, rgba(0, 120, 255, 0.25), rgba(2, 8, 22, 0.92));
        z-index: 0;
        pointer-events: none;
      }
      #wdMainHubOverlay > * {
        position: relative;
        z-index: 1;
      }
      .hub-card {
        width: 100%;
        max-width: 760px;
        background-color: #995533;
        border-style: solid;
        border-width: 22px;
        border-image: url('assets/sprites/GJ_square01.png') 24 fill stretch;
        padding: 8px 14px;
        box-shadow: 0 16px 45px rgba(0,0,0,0.85);
        max-height: 88vh;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      .vs-gd-inner {
        background-color: rgba(0,0,0,0.45);
        border-style: solid;
        border-width: 14px;
        border-image: url('assets/sprites/GJ_square02.png') 16 fill stretch;
        padding: 6px 10px;
        margin-bottom: 10px;
      }
      .gd-sprite-btn {
        border-style: solid;
        border-width: 12px;
        border-image: url('assets/sprites/GJ_button_01.png') 14 fill stretch;
        background: transparent;
        color: #fff;
        font-family: 'Pusab', 'Trebuchet MS', 'Arial Black', sans-serif;
        font-weight: 900;
        font-size: 0.98rem;
        text-decoration: none;
        text-transform: uppercase;
        text-shadow: 0 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000;
        padding: 2px 10px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        transition: transform 0.1s;
        user-select: none;
        touch-action: manipulation;
      }
      .gd-sprite-btn:hover { transform: scale(1.03); }
      .gd-sprite-btn:active { transform: scale(0.95); }
      .gd-btn-02 { border-image-source: url('assets/sprites/GJ_button_02.png'); }
      .gd-btn-03 { border-image-source: url('assets/sprites/GJ_button_03.png'); }
      .gd-btn-04 { border-image-source: url('assets/sprites/GJ_button_04.png'); }

      .hub-menu-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 10px;
        margin-top: 8px;
      }
      .icon-box-frame {
        width: 58px;
        height: 58px;
        background: rgba(0,0,0,0.55);
        border: 3px solid #000;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .form-input-gd {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 3px solid #000;
        background: rgba(0,0,0,0.7);
        color: #fff;
        font-size: 1rem;
        font-weight: 900;
        margin-bottom: 10px;
        outline: none;
        -webkit-user-select: text;
        user-select: text;
      }
      #wdVersusLobbyOverlay, #wdVersusVictoryOverlay, #wdLeaderboardOverlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.84);
        z-index: 9500;
        display: none;
        align-items: center;
        justify-content: center;
        font-family: 'Pusab', 'Trebuchet MS', Arial, sans-serif;
        color: #fff;
        text-shadow: 0 2px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000;
        padding: 10px;
      }
      .vs-gd-modal {
        width: 100%;
        max-width: 820px;
        background-color: #995533;
        border-style: solid;
        border-width: 20px;
        border-image: url('assets/sprites/GJ_square01.png') 24 fill stretch;
        padding: 8px 12px;
        box-shadow: 0 15px 40px rgba(0,0,0,0.85);
        max-height: 94vh;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      .vs-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        gap: 8px;
      }
      .vs-header h2 { color: #ffd700; font-size: clamp(1.1rem, 3vw, 1.55rem); font-weight: 900; }
      .vs-players-cards {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 10px;
        align-items: center;
        margin: 10px 0;
      }
      .vs-pcard {
        background: rgba(0,0,0,0.5);
        border: 3px solid #000;
        border-radius: 12px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        text-align: center;
      }
      .vs-room-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(0,0,0,0.5);
        border: 3px solid #000;
        border-radius: 10px;
        padding: 8px 10px;
        margin-bottom: 8px;
        flex-wrap: wrap;
        gap: 8px;
      }
      #wdVersusHUD {
        position: fixed;
        top: 6px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 8900;
        width: min(620px, 94vw);
        background-color: #995533;
        border-style: solid;
        border-width: 12px;
        border-image: url('assets/sprites/GJ_square01.png') 14 fill stretch;
        padding: 2px 8px;
        font-family: 'Pusab', 'Trebuchet MS', Arial, sans-serif;
        color: #fff;
        text-shadow: 0 2px 0 #000;
        display: none;
        pointer-events: none;
      }
      .hud-rule-tag {
        text-align: center;
        font-size: 10px;
        font-weight: 900;
        color: #ffd700;
        margin-bottom: 2px;
      }
      .hud-p-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 3px 0;
        font-size: 11px;
        font-weight: 900;
      }
      .hud-name { width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .hud-bar-bg {
        flex: 1;
        height: 12px;
        background: #111 url('assets/sprites/slidergroove2.png') no-repeat center/100% 100%;
        border-radius: 999px;
        overflow: hidden;
        border: 2px solid #000;
      }
      .hud-bar-fill { height: 100%; width: 0%; transition: width 0.08s linear; }
      .hud-pct { width: 95px; text-align: right; color: #ffd700; }

      /* Mobile Landscape & Compact Screen Optimizations */
      @media screen and (max-height: 500px), screen and (max-width: 680px) {
        #wdMainHubOverlay { padding: 6px; justify-content: flex-start; }
        .hub-banner-img { max-width: min(260px, 65vw) !important; }
        .hub-card { border-width: 14px; padding: 4px 8px; max-height: 94vh; }
        .vs-gd-inner { border-width: 10px; padding: 4px 8px; margin-bottom: 6px; }
        .gd-sprite-btn { border-width: 9px; font-size: 0.82rem !important; padding: 2px 6px !important; }
        .icon-box-frame { width: 44px; height: 44px; }
        .vs-gd-modal { border-width: 14px; padding: 6px 8px; }
        .vs-players-cards { grid-template-columns: 1fr; gap: 6px; }
      }
    `;
    document.head.appendChild(style);
  }

  function createDOMElements() {
    injectStyles();

    if (!document.getElementById('wdMobileLockOverlay')) {
      const lock = document.createElement('div');
      lock.id = 'wdMobileLockOverlay';
      lock.className = 'active-lock';
      lock.innerHTML = `
        <div class="hub-card" style="max-width:380px;">
          <h2 style="color:#ffd700; font-size:1.5rem; margin-bottom:8px;">🔄 ROTATE DEVICE</h2>
          <div class="vs-gd-inner" style="font-size:0.95rem; line-height:1.4;">
            Web Dashers 1v1 Versus plays best in <b>Landscape Mode</b>! Rotate your phone sideways or tap below to lock fullscreen landscape.
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
            <button class="gd-sprite-btn gd-btn-02" onclick="window.toggleClientFullscreenAndLock()">⛶ FULLSCREEN & LOCK LANDSCAPE</button>
            <button class="gd-sprite-btn gd-btn-04" onclick="document.getElementById('wdMobileLockOverlay').classList.remove('active-lock')">Continue Anyway</button>
          </div>
        </div>
      `;
      document.body.appendChild(lock);
    }

    if (!document.getElementById('wdMainHubOverlay')) {
      const hub = document.createElement('div');
      hub.id = 'wdMainHubOverlay';
      hub.innerHTML = `
        <div style="text-align:center; margin-bottom:8px;">
          <img class="hub-banner-img" src="wd_branding/wordmark_gd/wordmark_gd.png" onerror="this.style.display='none'; document.getElementById('wdFallbackLogo').style.display='block';" style="max-width:min(440px, 84vw); height:auto; filter:drop-shadow(0 6px 10px rgba(0,0,0,0.75));" />
          <h1 id="wdFallbackLogo" style="display:none; font-size:2.4rem; color:#c1fb3d;">WEB DASHERS</h1>
          <div style="color:#ffd700; font-size:0.95rem; letter-spacing:1.5px; margin-top:2px;">⚔ 1v1 VERSUS · RANKED & PRACTICE CLIENT ⚔</div>
        </div>

        <!-- AUTH VIEW (If not logged in) -->
        <div id="wdHubAuthCard" class="hub-card" style="max-width:460px; display:none;">
          <div style="display:flex; gap:10px; margin-bottom:10px;">
            <button class="gd-sprite-btn" style="flex:1;" id="hubTabLogin" onclick="window.switchHubAuth('login')">Login</button>
            <button class="gd-sprite-btn gd-btn-04" style="flex:1;" id="hubTabRegister" onclick="window.switchHubAuth('register')">Create Account</button>
          </div>
          <div id="hubAuthError" style="display:none; color:#ff6b6b; background:rgba(0,0,0,0.65); padding:8px; border-radius:8px; margin-bottom:10px; font-weight:900;"></div>
          <form onsubmit="window.submitHubAuth(event)">
            <label style="color:#ffd700; font-size:0.85rem; display:block; margin-bottom:4px;">USERNAME</label>
            <input type="text" id="hubUsername" class="form-input-gd" required maxlength="20" placeholder="Enter Dasher Name..." />
            <label style="color:#ffd700; font-size:0.85rem; display:block; margin-bottom:4px;">PASSWORD</label>
            <input type="password" id="hubPassword" class="form-input-gd" required placeholder="••••••••" />
            <button type="submit" class="gd-sprite-btn" style="width:100%; font-size:1.05rem;" id="hubAuthSubmitBtn">LOGIN TO ACCOUNT</button>
          </form>
          <div style="margin-top:10px; display:flex; gap:8px;">
            <button class="gd-sprite-btn gd-btn-02" style="flex:1;" onclick="window.openLeaderboardModal()">🏆 LEADERBOARDS</button>
            <button class="gd-sprite-btn gd-btn-04" onclick="window.toggleClientFullscreenAndLock()">⛶ FULLSCREEN</button>
          </div>
        </div>

        <!-- LOGGED IN MAIN CLIENT HUB -->
        <div id="wdHubMenuCard" class="hub-card" style="display:none;">
          <div class="vs-gd-inner" style="display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px;">
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="icon-box-frame"><canvas id="hubMyCubeCanvas" width="48" height="48"></canvas></div>
              <div class="icon-box-frame"><canvas id="hubMyRankCanvas" width="50" height="50"></canvas></div>
              <div>
                <div id="hubWelcomeName" style="font-size:1.3rem; font-weight:900; color:#fff;">Player</div>
                <div style="display:flex; flex-wrap:wrap; gap:8px; font-size:0.85rem; margin-top:2px;">
                  <span id="hubMyRankName" style="color:#00ffff; font-weight:900;">Easy I</span>
                  <span id="hubMyRankedRP" style="color:#ffd700; font-weight:900;">★ 0 Ranked RP</span>
                  <span id="hubMyUnrankedPts" style="color:#c1fb3d; font-weight:900;">⚔ 0 Unranked Pts</span>
                </div>
              </div>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:6px;">
              <button class="gd-sprite-btn gd-btn-04" style="font-size:0.78rem;" onclick="window.toggleClientFullscreenAndLock()">⛶ Fullscreen</button>
              <button class="gd-sprite-btn gd-btn-04" style="font-size:0.78rem;" onclick="window.openGameSettings()">⚙ Settings</button>
              <button class="gd-sprite-btn gd-btn-03" style="font-size:0.78rem;" onclick="window.hubLogout()">Logout</button>
            </div>
          </div>

          <div class="hub-menu-grid">
            <button class="gd-sprite-btn gd-btn-02" style="font-size:1.08rem; padding:10px;" onclick="window.openVersusLobby()">
              ⚔ 1v1 VERSUS MODE
            </button>
            <button class="gd-sprite-btn" style="font-size:1.08rem; padding:10px;" onclick="window.openSoloPractice()">
              🎯 SOLO PRACTICE
            </button>
            <button class="gd-sprite-btn gd-btn-04" style="font-size:1.05rem; padding:10px;" onclick="window.openCharacterEditor()">
              🎨 CHARACTER EDITOR
            </button>
            <button class="gd-sprite-btn gd-btn-02" style="font-size:1.05rem; padding:10px;" onclick="window.openLeaderboardModal()">
              🏆 LEADERBOARDS
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(hub);
    }

    if (!document.getElementById('wdLeaderboardOverlay')) {
      const lb = document.createElement('div');
      lb.id = 'wdLeaderboardOverlay';
      lb.innerHTML = `
        <div class="vs-gd-modal">
          <div class="vs-header">
            <h2>🏆 IN-GAME LEADERBOARDS</h2>
            <button class="gd-sprite-btn gd-btn-03" onclick="window.closeLeaderboardModal()">✕ Close</button>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
            <button class="gd-sprite-btn" id="lbTabBtnRanked" onclick="window.switchLbTab('ranked')">🏆 RANKED</button>
            <button class="gd-sprite-btn gd-btn-04" id="lbTabBtnUnranked" onclick="window.switchLbTab('unranked')">⚔ UNRANKED</button>
            <button class="gd-sprite-btn gd-btn-02" style="margin-left:auto;" onclick="window.fetchLeaderboards()">↻ Refresh</button>
          </div>
          <div class="vs-gd-inner" id="wdLeaderboardRows" style="max-height:58vh; overflow-y:auto;">
            <div style="text-align:center; padding:20px;">Loading top players...</div>
          </div>
        </div>
      `;
      document.body.appendChild(lb);
    }

    if (!document.getElementById('wdVersusLobbyOverlay')) {
      const lob = document.createElement('div');
      lob.id = 'wdVersusLobbyOverlay';
      lob.innerHTML = `<div class="vs-gd-modal" id="wdVersusLobbyContent"></div>`;
      document.body.appendChild(lob);
    }

    if (!document.getElementById('wdVersusVictoryOverlay')) {
      const vic = document.createElement('div');
      vic.id = 'wdVersusVictoryOverlay';
      vic.innerHTML = `<div class="vs-gd-modal" id="wdVersusVictoryContent" style="max-width:520px; text-align:center;"></div>`;
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

  // --- HUB AUTH & PROFILE FUNCTIONS ---
  window.switchHubAuth = function (mode) {
    versusState.authMode = mode;
    document.getElementById('hubTabLogin').className = mode === 'login' ? 'gd-sprite-btn' : 'gd-sprite-btn gd-btn-04';
    document.getElementById('hubTabRegister').className = mode === 'register' ? 'gd-sprite-btn' : 'gd-sprite-btn gd-btn-04';
    document.getElementById('hubAuthSubmitBtn').textContent = mode === 'login' ? 'LOGIN TO ACCOUNT' : 'CREATE ACCOUNT';
    document.getElementById('hubAuthError').style.display = 'none';
  };

  window.submitHubAuth = async function (e) {
    e.preventDefault();
    const errEl = document.getElementById('hubAuthError');
    errEl.style.display = 'none';
    const username = document.getElementById('hubUsername').value.trim();
    const password = document.getElementById('hubPassword').value;
    try {
      const endpoint = versusState.authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password, lastIcon: getLocalIcon() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Authentication failed');
      versusState.myUser = data.user;
      if (window.AccountAPI) window.AccountAPI.currentUser = data.user;
      if (data.user.lastIcon) {
        localStorage.setItem('iconCurrentPlayer', data.user.lastIcon.player || 'player_01');
        localStorage.setItem('iconMainColor', data.user.lastIcon.mainColor || '04FF00');
        localStorage.setItem('iconSecondaryColor', data.user.lastIcon.secondaryColor || '00FBFF');
      }
      socket.emit('versus:auth', {
        username: data.user.username,
        browserId: getBrowserId(),
        lastIcon: getLocalIcon()
      });
      refreshMainHubUI();
    } catch (err) {
      errEl.textContent = err.message;
      errEl.style.display = 'block';
    }
  };

  window.hubLogout = async function () {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    versusState.myUser = null;
    if (window.AccountAPI) window.AccountAPI.currentUser = null;
    refreshMainHubUI();
  };

  function refreshMainHubProfile() {
    const u = versusState.myUser;
    if (!u) return;
    const nameEl = document.getElementById('hubWelcomeName');
    const rName = document.getElementById('hubMyRankName');
    const rPts = document.getElementById('hubMyRankedRP');
    const uPts = document.getElementById('hubMyUnrankedPts');
    if (nameEl) nameEl.textContent = u.username;
    if (rName) rName.textContent = u.rankInfo ? u.rankInfo.name : 'Easy I';
    if (rPts) rPts.textContent = `★ ${u.rankedPoints || 0} Ranked RP`;
    if (uPts) uPts.textContent = `⚔ ${u.unrankedPoints || 0} Unranked Pts`;
    renderIcon(document.getElementById('hubMyCubeCanvas'), getLocalIcon());
    if (u.rankInfo) renderRankBadge(document.getElementById('hubMyRankCanvas'), u.rankInfo);
  }

  function refreshMainHubUI() {
    createDOMElements();
    const authCard = document.getElementById('wdHubAuthCard');
    const menuCard = document.getElementById('wdHubMenuCard');
    if (!authCard || !menuCard) return;
    if (versusState.myUser) {
      authCard.style.display = 'none';
      menuCard.style.display = 'block';
      refreshMainHubProfile();
    } else {
      authCard.style.display = 'block';
      menuCard.style.display = 'none';
    }
  }

  // --- IN-GAME LEADERBOARD MODAL ---
  window.openLeaderboardModal = function () {
    createDOMElements();
    document.getElementById('wdLeaderboardOverlay').style.display = 'flex';
    window.fetchLeaderboards();
  };

  function closeLeaderboardModal() {
    const el = document.getElementById('wdLeaderboardOverlay');
    if (el) el.style.display = 'none';
  }
  window.closeLeaderboardModal = closeLeaderboardModal;

  window.switchLbTab = function (tab) {
    versusState.lbTab = tab;
    document.getElementById('lbTabBtnRanked').className = tab === 'ranked' ? 'gd-sprite-btn' : 'gd-sprite-btn gd-btn-04';
    document.getElementById('lbTabBtnUnranked').className = tab === 'unranked' ? 'gd-sprite-btn' : 'gd-sprite-btn gd-btn-04';
    renderLeaderboardModalRows();
  };

  window.fetchLeaderboards = async function () {
    try {
      const res = await fetch('/api/leaderboard');
      versusState.cachedLb = await res.json();
      renderLeaderboardModalRows();
    } catch (e) {}
  };

  function renderLeaderboardModalRows() {
    const container = document.getElementById('wdLeaderboardRows');
    if (!container) return;
    const isRanked = versusState.lbTab === 'ranked';
    const rows = isRanked ? versusState.cachedLb.rankedLeaderboard : versusState.cachedLb.unrankedLeaderboard;
    if (!rows || rows.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:20px;">No players ranked yet! Win a 1v1 match to claim #1!</div>';
      return;
    }
    container.innerHTML = '';
    rows.forEach((entry) => {
      const pts = isRanked ? entry.rankedPoints : entry.unrankedPoints;
      const wins = isRanked ? entry.rankedWins : entry.unrankedWins;
      const losses = isRanked ? entry.rankedLosses : entry.unrankedLosses;
      const div = document.createElement('div');
      div.className = 'vs-room-row';
      div.innerHTML = `
        <div style="display:flex; align-items:center; gap:10px;">
          <div style="font-size:1.2rem; font-weight:900; color:#ffd700; width:34px; text-align:center;">#${entry.rank}</div>
          <div class="icon-box-frame" style="width:42px; height:42px;"><canvas width="36" height="36" id="m_lb_cube_${entry.rank}"></canvas></div>
          <div>
            <div style="font-size:1.05rem; font-weight:900;">${entry.username}</div>
            <div style="font-size:0.78rem; color:#8ce0ff;">${wins}W - ${losses}L</div>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          ${isRanked ? `
            <div style="display:flex; align-items:center; gap:6px; background:rgba(0,0,0,0.45); padding:3px 8px; border-radius:8px; border:2px solid #000;">
              <canvas width="36" height="36" id="m_lb_rank_${entry.rank}"></canvas>
              <span style="color:#00ffff; font-weight:900; font-size:0.9rem;">${entry.rankInfo ? entry.rankInfo.name : 'Easy I'}</span>
            </div>
          ` : ''}
          <div style="color:#ffd700; font-weight:900; font-size:1rem;">${isRanked ? `★ ${pts} RP` : `⚔ ${pts} Pts`}</div>
        </div>
      `;
      container.appendChild(div);
      renderIcon(div.querySelector(`#m_lb_cube_${entry.rank}`), entry.lastIcon);
      if (isRanked && entry.rankInfo) {
        renderRankBadge(div.querySelector(`#m_lb_rank_${entry.rank}`), entry.rankInfo);
      }
    });
  }

  // --- VERSUS LOBBY MODAL ---
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
      const queueBanner = versusState.inQueue
        ? `
          <div class="vs-gd-inner" style="text-align:center; border-color:#ffd700;">
            <div style="font-size:1.2rem; color:#c1fb3d; font-weight:900;">
              🔍 SEARCHING FOR ${versusState.queueIsRanked ? 'RANKED' : 'UNRANKED'} 1v1 OPPONENT...
            </div>
            <div style="font-size:0.85rem; color:#ffd700; margin:6px 0;">
               Match launches automatically as soon as an opponent matches!
            </div>
            <button class="gd-sprite-btn gd-btn-03" onclick="window.VersusSocket.emit('versus:leave_queue')">Cancel Queue</button>
          </div>
        `
        : `
          <div class="vs-gd-inner">
            <div style="text-align:center; color:#ffd700; font-weight:900; margin-bottom:8px; font-size:0.92rem;">
              ⚡ QUICK MATCHMAKING QUEUE (AUTO-MATCH WITH OPPONENT)
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center;">
              <button class="gd-sprite-btn gd-btn-02" onclick="window.VersusSocket.emit('versus:join_queue', { isRanked: true })">
                🏆 RANKED 1v1 QUEUE (${versusState.rankedInQueue} Waiting)
              </button>
              <button class="gd-sprite-btn" onclick="window.VersusSocket.emit('versus:join_queue', { isRanked: false })">
                ⚔ UNRANKED 1v1 QUEUE (${versusState.unrankedInQueue} Waiting)
              </button>
            </div>
          </div>
        `;

      const roomsHtml = (versusState.publicRooms || []).length === 0
        ? `<div style="text-align:center; padding:14px; color:#ddd;">No open lobbies right now. Join a Queue above or Host a Lobby below!</div>`
        : versusState.publicRooms.map(r => `
            <div class="vs-room-row">
              <div>
                <div style="font-weight:900; font-size:1rem;">
                  <span style="color:${r.isRanked ? '#00ffff' : '#c1fb3d'};">[${r.isRanked ? '🏆 RANKED' : '⚔ UNRANKED'}]</span>
                  ${r.hostName} <span style="color:#ffd700;">(${r.hostRank ? r.hostRank.name : 'Easy I'} · ★ ${r.hostPoints})</span>
                </div>
                <div style="font-size:0.82rem; color:#9be8ff;">Level: <b>${r.levelName}</b> (${r.difficulty}) · <span style="color:#c1fb3d;">+${r.points} Points</span> · Rule: ${r.ruleName}</div>
              </div>
              <button class="gd-sprite-btn" onclick="window.VersusSocket.emit('versus:join_room', { roomId: '${r.id}' })">JOIN</button>
            </div>
          `).join('');

      container.innerHTML = `
        <div class="vs-header">
          <h2>⚔ 1v1 VERSUS · QUEUE & LOBBIES</h2>
          <button class="gd-sprite-btn gd-btn-03" onclick="window.closeVersusLobby()">✕ Close</button>
        </div>

        ${queueBanner}

        <div class="vs-gd-inner" style="display:flex; flex-wrap:wrap; gap:8px; justify-content:space-between; align-items:center;">
          <div style="display:flex; flex-wrap:wrap; gap:8px;">
            <button class="gd-sprite-btn gd-btn-02" onclick="window.VersusSocket.emit('versus:create_room', { levelId: 'level_1', isPublic: true, isRanked: true })">🏆 Host Ranked</button>
            <button class="gd-sprite-btn" onclick="window.VersusSocket.emit('versus:create_room', { levelId: 'level_1', isPublic: true, isRanked: false })">+ Host Unranked</button>
            <button class="gd-sprite-btn gd-btn-04" onclick="window.VersusSocket.emit('versus:create_room', { levelId: 'level_1', isPublic: false, isRanked: false })">🔒 Private</button>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <input id="joinCodeInput" placeholder="CODE..." maxlength="6" style="padding:7px; border-radius:8px; border:3px solid #000; background:rgba(0,0,0,0.7); color:#fff; font-weight:900; width:95px; text-transform:uppercase; -webkit-user-select:text; user-select:text;" />
            <button class="gd-sprite-btn gd-btn-02" onclick="window.VersusSocket.emit('versus:join_room', { roomId: document.getElementById('joinCodeInput').value })">Join</button>
          </div>
        </div>

        <div class="vs-gd-inner">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <h3 style="color:#ffd700; font-size:1rem;">OPEN 1v1 LOBBIES</h3>
            <button class="gd-sprite-btn gd-btn-04" style="font-size:0.75rem;" onclick="window.VersusSocket.emit('versus:list_rooms')">↻ Refresh</button>
          </div>
          <div>${roomsHtml}</div>
        </div>
      `;
    } else {
      const isHost = room.hostId === socket.id;
      const p1 = room.players[0];
      const p2 = room.players[1] || null;

      const levelOptions = levels.map(l => `
        <option value="${l.id}" ${l.id === room.level.id ? 'selected' : ''}>
          ${l.name} (${l.difficulty}) — +${l.points} Points
        </option>
      `).join('');

      const ruleOptions = [
        { id: 'race', label: 'First to 100% (Standard Race)' },
        { id: 'min_attempts', label: 'Min Attempts (Fewest Attempts at 100%)' },
        { id: 'max_attempts_4', label: 'Max 4 Attempts (Furthest % in 4 Attempts)' }
      ].map(r => `<option value="${r.id}" ${r.id === room.ruleMode ? 'selected' : ''}>${r.label}</option>`).join('');

      container.innerHTML = `
        <div class="vs-header">
          <h2>${room.isRanked ? '🏆 RANKED' : '⚔ UNRANKED'} LOBBY: <span style="color:#00ffff;">${room.id}</span></h2>
          <button class="gd-sprite-btn gd-btn-03" onclick="window.VersusSocket.emit('versus:leave_room'); window.VersusState.room = null; window.openVersusLobby();">Leave</button>
        </div>

        <div class="vs-gd-inner" style="text-align:center;">
          <div style="font-size:1.25rem; font-weight:900; color:#fff;">
            ${room.level.name} <span style="color:#c1fb3d;">(+${room.level.points} ${room.isRanked ? 'Ranked RP' : 'Unranked Pts'})</span>
          </div>
          <div style="font-size:0.85rem; color:#ffd700; margin:4px 0;">
            Rule: ${room.ruleName} — ${room.ruleDesc}
          </div>
          ${isHost ? `
            <div style="display:flex; flex-wrap:wrap; gap:6px; justify-content:center; margin-top:6px;">
              <select onchange="window.VersusSocket.emit('versus:change_level', { levelId: this.value })" style="padding:5px 8px; border-radius:8px; background:#000; color:#fff; border:2px solid #ffd700; font-weight:900; max-width:100%;">
                ${levelOptions}
              </select>
              <select onchange="window.VersusSocket.emit('versus:change_rule', { ruleMode: this.value })" style="padding:5px 8px; border-radius:8px; background:#000; color:#00ffff; border:2px solid #00ffff; font-weight:900; max-width:100%;">
                ${ruleOptions}
              </select>
              <select onchange="window.VersusSocket.emit('versus:change_ranked', { isRanked: this.value === 'true' })" style="padding:5px 8px; border-radius:8px; background:#000; color:#c1fb3d; border:2px solid #c1fb3d; font-weight:900; max-width:100%;">
                <option value="false" ${!room.isRanked ? 'selected' : ''}>⚔ Mode: Unranked (No Cooldown)</option>
                <option value="true" ${room.isRanked ? 'selected' : ''}>🏆 Mode: Ranked (RP & Rank Faces)</option>
              </select>
            </div>
          ` : ''}
        </div>

        <div class="vs-players-cards">
          <div class="vs-pcard">
            <div style="display:flex; gap:10px; align-items:center;">
              <canvas id="vsRoomP1Icon" width="48" height="48"></canvas>
              <canvas id="vsRoomP1Rank" width="48" height="48"></canvas>
            </div>
            <div style="font-size:1.1rem; font-weight:900;">${p1 ? p1.username : 'Waiting...'}</div>
            <div style="color:#00ffff; font-weight:900; font-size:0.88rem;">${p1 && p1.rankInfo ? p1.rankInfo.name : 'Easy I'} (★ ${p1 ? p1.rankedPoints : 0} RP)</div>
          </div>

          <div style="font-size:1.6rem; font-weight:900; color:#ffd700; text-align:center;">VS</div>

          <div class="vs-pcard">
            <div style="display:flex; gap:10px; align-items:center;">
              <canvas id="vsRoomP2Icon" width="48" height="48"></canvas>
              <canvas id="vsRoomP2Rank" width="48" height="48"></canvas>
            </div>
            <div style="font-size:1.1rem; font-weight:900;">${p2 ? p2.username : 'Waiting for Opponent...'}</div>
            <div style="color:#00ffff; font-weight:900; font-size:0.88rem;">${p2 ? `${p2.rankInfo ? p2.rankInfo.name : 'Easy I'} (★ ${p2.rankedPoints} RP)` : 'Code: ' + room.id}</div>
          </div>
        </div>

        <div style="text-align:center; margin-top:10px;">
          ${isHost ? `
            <button class="gd-sprite-btn" style="font-size:1.1rem; padding:6px 22px; ${!p2 ? 'opacity:0.5;' : ''}" onclick="window.VersusSocket.emit('versus:start_match')">
              ${p2 ? '▶ START 1v1 MATCH!' : 'Waiting for Player 2...'}
            </button>
          ` : `
            <div style="font-size:1rem; font-weight:900; color:#c1fb3d;">Ready! Waiting for Host to start...</div>
          `}
        </div>
      `;

      if (p1) {
        renderIcon(document.getElementById('vsRoomP1Icon'), p1.lastIcon);
        renderRankBadge(document.getElementById('vsRoomP1Rank'), p1.rankInfo);
      }
      if (p2) {
        renderIcon(document.getElementById('vsRoomP2Icon'), p2.lastIcon);
        renderRankBadge(document.getElementById('vsRoomP2Rank'), p2.rankInfo);
      }
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
      ruleTag.textContent = `${versusState.room.isRanked ? '🏆 RANKED' : '⚔ UNRANKED'} · ${versusState.room.ruleName} · GLOBED GHOST`;
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
    const ptsLabel = room.winner.isRanked ? 'RANKED RP' : 'UNRANKED POINTS';
    content.innerHTML = `
      <h2 style="font-size:2rem; color:${iWon ? '#88ff2b' : '#ff5e5e'}; margin-bottom:6px;">
        ${iWon ? '🏆 VICTORY!' : '💀 DEFEAT!'}
      </h2>
      <div style="font-size:1rem; font-weight:900; margin-bottom:10px;">
        ${room.winner.reasonText}
      </div>
      <div class="vs-gd-inner" style="display:flex; flex-direction:column; align-items:center; gap:6px;">
        <canvas id="vicRankBadge" width="60" height="60"></canvas>
        <div style="color:#ffd700; font-size:1.3rem; font-weight:900;">
          ${iWon ? `+${room.winner.pointsAwarded} ${ptsLabel}!` : `+0 ${ptsLabel}`}
        </div>
        <div style="font-size:0.92rem; color:#00ffff; font-weight:900;">
          Winner Rank: ${room.winner.rankInfo ? room.winner.rankInfo.name : 'Easy I'} (Total: ★ ${room.winner.newTotalPoints})
        </div>
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:10px; justify-content:center; margin-top:12px;">
        <button class="gd-sprite-btn" onclick="window.backToVersusRoom()">Return to 1v1 Lobby</button>
        <button class="gd-sprite-btn gd-btn-04" onclick="window.returnToCustomClient()">Return to Main Client</button>
      </div>
    `;
    ov.style.display = 'flex';
    if (room.winner.rankInfo) {
      renderRankBadge(document.getElementById('vicRankBadge'), room.winner.rankInfo);
    }
  }

  function hideVictoryModal() {
    const ov = document.getElementById('wdVersusVictoryOverlay');
    if (ov) ov.style.display = 'none';
  }
  window.hideVictoryModal = hideVictoryModal;

  window.returnToCustomClient = function () {
    hideVictoryModal();
    const scene = window._gameScene;
    if (scene && !scene._menuActive) {
      scene._menuActive = true;
      scene.scene.restart();
    }
  };

  window.backToVersusRoom = function () {
    window.returnToCustomClient();
    window.openVersusLobby();
  };

  function hideStockPhaserMenuSprites(scene) {
    const hideList = [
      scene._logo, scene._robLogo, scene._playBtn, scene._iconBtn, scene._creatorBtn,
      scene._menuGlitter, scene._menuSettingsBtn, scene._menuStatsBtn,
      scene._menuAchievementsBtn, scene._menuNewgroundsBtn, scene._menuInfoBtn,
      scene._tryMeImg, scene._copyrightText, scene._chrSelDecor, scene._lvlEditDecor,
      scene._menuFsBtn
    ];
    hideList.forEach(s => { if (s && s.setVisible) s.setVisible(false); });
    if (scene._socialIcons) scene._socialIcons.forEach(ic => ic && ic.setVisible(false));
    if (scene._downloadBtns) scene._downloadBtns.forEach(b => b && b.setVisible(false));
  }

  function installGameSceneHooks() {
    if (typeof GameScene === 'undefined') {
      setTimeout(installGameSceneHooks, 100);
      return;
    }

    GameScene.prototype._buildNewsPopup = function () {};
    GameScene.prototype._buildUpdateLogPopup = function () {};

    const origMakeBouncy = GameScene.prototype._makeBouncyButton;
    GameScene.prototype._makeBouncyButton = function (target, baseScale, onClick, canActivate) {
      if (target && target === this._iconBtn && typeof onClick === 'function') {
        this._triggerGarageOpen = onClick;
      }
      return origMakeBouncy.apply(this, arguments);
    };

    const origCreate = GameScene.prototype.create;
    GameScene.prototype.create = function () {
      window._gameScene = this;
      origCreate.apply(this, arguments);
      versusState.engineReady = true;

      if (this._closeNewsPopup) { try { this._closeNewsPopup(); } catch (e) {} }
      if (this._closeUpdateLogPopup) { try { this._closeUpdateLogPopup(); } catch (e) {} }

      hideStockPhaserMenuSprites(this);
      this._openCreatorMenu = () => window.openVersusLobby();

      this._globedGhostGfx = this.add.graphics().setScrollFactor(0).setDepth(48).setVisible(false);
      this._globedGhostLabel = this.add.bitmapText(0, 0, 'bigFont', '', 16)
        .setOrigin(0.5, 1).setScrollFactor(0).setDepth(49).setAlpha(0.85).setVisible(false);

      createDOMElements();
      refreshMainHubUI();
      updateInGameHUD();
    };

    const origPositionMenu = GameScene.prototype._positionMenuItems;
    GameScene.prototype._positionMenuItems = function () {
      origPositionMenu.apply(this, arguments);
      hideStockPhaserMenuSprites(this);
    };

    const origUpdate = GameScene.prototype.update;
    GameScene.prototype.update = function (time, delta) {
      origUpdate.apply(this, arguments);

      hideStockPhaserMenuSprites(this);

      const subOverlayOpen = !!(
        this._iconOverlay ||
        this._levelSelectOverlay ||
        this._settingsLayerOverlay ||
        this._settingsPopup
      );
      const shouldShowHub = this._menuActive && !subOverlayOpen;

      const hub = document.getElementById('wdMainHubOverlay');
      if (hub) {
        if (hub.style.display !== (shouldShowHub ? 'flex' : 'none')) {
          hub.style.display = shouldShowHub ? 'flex' : 'none';
          if (shouldShowHub) refreshMainHubProfile();
        }
      }

      if (this.game && this.game.canvas) {
        this.game.canvas.style.visibility = shouldShowHub ? 'hidden' : 'visible';
      }

      if (versusState.activeMatch && !this._menuActive && this._level && this._level.endXPos > 0) {
        if (window.noClip) window.noClip = false;

        const upDown = !!(this._state && this._state.upKeyDown);
        const justJumped = upDown && !versusState.prevUpKeyDown;
        versusState.prevUpKeyDown = upDown;
        if (justJumped) versusState.jumpsCount++;

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
            died: isDead,
            jumps: versusState.jumpsCount
          });
        }

        const now = performance.now();
        if (now - versusState.lastGhostEmit >= 33 && this._state) {
          versusState.lastGhostEmit = now;
          const spr = this._player && this._player._playerSpriteLayer && this._player._playerSpriteLayer.sprite;
          socket.emit('versus:ghost', {
            x: Math.round(this._playerWorldX),
            y: Math.round(this._state.y || 30),
            angle: spr ? Math.round(spr.angle || 0) : 0,
            dead: isDead,
            jumped: justJumped
          });
        }

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

            const rad = (g.angle || 0) * (Math.PI / 180);
            const cos = Math.cos(rad), sin = Math.sin(rad);
            const rotPt = (lx, ly) => ({
              x: screenX + (lx * cos - ly * sin),
              y: screenY + (lx * sin + ly * cos)
            });

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
