const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const cookieParser = require('cookie-parser');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', credentials: true }
});

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Assign a unique per-browser instance cookie (School Wi-Fi safe: doesn't use IP or Chromebook hardware model!)
app.use((req, res, next) => {
  if (!req.cookies?.wd_browser_id) {
    const bId = crypto.randomUUID();
    res.cookie('wd_browser_id', bId, { httpOnly: false, maxAge: 365 * 24 * 3600 * 1000, sameSite: 'lax' });
    req.browserId = bId;
  } else {
    req.browserId = req.cookies.wd_browser_id;
  }
  next();
});

const DATA_DIR = process.env.RENDER_DISK_PATH || path.join(__dirname, 'db');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'database.json');

let db = {
  users: [],
  sessions: {},
  matchHistory: []
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      db.users = parsed.users || [];
      db.sessions = parsed.sessions || {};
      db.matchHistory = parsed.matchHistory || [];
    }
  } catch (e) {
    console.error('Error loading DB:', e);
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {
    console.error('Error saving DB:', e);
  }
}

loadDB();

const MAIN_LEVELS = [
  { id: 'level_1',  internal: 'stereo_madness',         name: 'Stereo Madness',         difficulty: 'Easy',   points: 10,  minSeconds: 25, author: ['RobTop', 'Forever Bound'] },
  { id: 'level_2',  internal: 'back_on_track',          name: 'Back On Track',          difficulty: 'Easy',   points: 10,  minSeconds: 25, author: ['RobTop', 'DJVI'] },
  { id: 'level_3',  internal: 'polargeist',             name: 'Polargeist',             difficulty: 'Normal', points: 15,  minSeconds: 25, author: ['RobTop', 'Step'] },
  { id: 'level_4',  internal: 'dry_out',                name: 'Dry Out',                difficulty: 'Normal', points: 15,  minSeconds: 25, author: ['RobTop', 'DJVI'] },
  { id: 'level_5',  internal: 'base_after_base',        name: 'Base After Base',        difficulty: 'Hard',   points: 20,  minSeconds: 25, author: ['RobTop', 'DJVI'] },
  { id: 'level_6',  internal: 'cant_let_go',            name: 'Cant Let Go',            difficulty: 'Hard',   points: 25,  minSeconds: 25, author: ['RobTop', 'DJVI'] },
  { id: 'level_7',  internal: 'jumper',                 name: 'Jumper',                 difficulty: 'Harder', points: 30,  minSeconds: 25, author: ['RobTop', 'Waterflame'] },
  { id: 'level_8',  internal: 'time_machine',           name: 'Time Machine',           difficulty: 'Harder', points: 35,  minSeconds: 25, author: ['RobTop', 'Waterflame'] },
  { id: 'level_9',  internal: 'cycles',                 name: 'Cycles',                 difficulty: 'Harder', points: 35,  minSeconds: 25, author: ['RobTop', 'DJVI'] },
  { id: 'level_10', internal: 'xstep',                  name: 'xStep',                  difficulty: 'Insane', points: 45,  minSeconds: 25, author: ['RobTop', 'DJVI'] },
  { id: 'level_11', internal: 'clutterfunk',            name: 'Clutterfunk',            difficulty: 'Insane', points: 55,  minSeconds: 25, author: ['RobTop', 'Waterflame'] },
  { id: 'level_12', internal: 'theory_of_everything',   name: 'Theory Of Everything',   difficulty: 'Insane', points: 50,  minSeconds: 25, author: ['RobTop', 'DJ-Nate'] },
  { id: 'level_13', internal: 'electroman_adventures',  name: 'Electroman Adventures',  difficulty: 'Insane', points: 50,  minSeconds: 25, author: ['RobTop', 'Waterflame'] },
  { id: 'level_14', internal: 'clubstep',               name: 'Clubstep',               difficulty: 'Demon',  points: 100, minSeconds: 25, author: ['RobTop', 'DJ-Nate'] },
  { id: 'level_15', internal: 'electrodynamix',         name: 'Electrodynamix',         difficulty: 'Insane', points: 75,  minSeconds: 25, author: ['RobTop', 'DJ-Nate'] },
  { id: 'level_16', internal: 'hexagon_force',          name: 'Hexagon Force',          difficulty: 'Insane', points: 70,  minSeconds: 25, author: ['RobTop', 'Waterflame'] },
  { id: 'level_17', internal: 'blast_processing',       name: 'Blast Processing',       difficulty: 'Harder', points: 40,  minSeconds: 25, author: ['RobTop', 'Waterflame'] },
  { id: 'level_18', internal: 'theory_of_everything_2', name: 'Theory Of Everything 2', difficulty: 'Demon',  points: 110, minSeconds: 25, author: ['RobTop', 'DJ-Nate'] },
  { id: 'level_19', internal: 'geometrical_dominator',  name: 'Geometrical Dominator',  difficulty: 'Harder', points: 40,  minSeconds: 25, author: ['RobTop', 'Waterflame'] },
  { id: 'level_20', internal: 'deadlocked',             name: 'Deadlocked',             difficulty: 'Demon',  points: 125, minSeconds: 25, author: ['RobTop', 'F-777'] },
  { id: 'level_21', internal: 'fingerdash',             name: 'Fingerdash',             difficulty: 'Insane', points: 55,  minSeconds: 25, author: ['RobTop', 'MDK'] },
  { id: 'level_22', internal: 'dash',                   name: 'Dash',                   difficulty: 'Insane', points: 60,  minSeconds: 25, author: ['RobTop', 'MDK'] }
];

const RULE_MODES = {
  race: { id: 'race', name: 'First to 100% (Race)', desc: 'First player to reach 100% wins!' },
  min_attempts: { id: 'min_attempts', name: 'Min Attempts (100%)', desc: 'Reach 100% in fewer attempts than your opponent!' },
  max_attempts_4: { id: 'max_attempts_4', name: 'Max 4 Attempts (Furthest %)', desc: 'You only get 4 attempts! Furthest % wins!' }
};

// --- RANK TIERS (Difficulty Face + Ring/Fire Division I, II, III) ---
// ring: 0 = plain face, 1 = yellow featured ring (GJ_featuredCoin_001.png), 2 = epic fire (GJ_epicCoin_001.png)
const RANK_TIERS = [
  { min: 0,    name: 'Easy I',          face: 'diffIcon_01_btn_001.png', ring: 0 },
  { min: 40,   name: 'Easy II',         face: 'diffIcon_01_btn_001.png', ring: 1 },
  { min: 85,   name: 'Easy III',        face: 'diffIcon_01_btn_001.png', ring: 2 },
  { min: 140,  name: 'Normal I',        face: 'diffIcon_02_btn_001.png', ring: 0 },
  { min: 200,  name: 'Normal II',       face: 'diffIcon_02_btn_001.png', ring: 1 },
  { min: 265,  name: 'Normal III',      face: 'diffIcon_02_btn_001.png', ring: 2 },
  { min: 340,  name: 'Hard I',          face: 'diffIcon_03_btn_001.png', ring: 0 },
  { min: 420,  name: 'Hard II',         face: 'diffIcon_03_btn_001.png', ring: 1 },
  { min: 510,  name: 'Hard III',        face: 'diffIcon_03_btn_001.png', ring: 2 },
  { min: 610,  name: 'Harder I',        face: 'diffIcon_04_btn_001.png', ring: 0 },
  { min: 720,  name: 'Harder II',       face: 'diffIcon_04_btn_001.png', ring: 1 },
  { min: 840,  name: 'Harder III',      face: 'diffIcon_04_btn_001.png', ring: 2 },
  { min: 970,  name: 'Insane I',        face: 'diffIcon_05_btn_001.png', ring: 0 },
  { min: 1110, name: 'Insane II',       face: 'diffIcon_05_btn_001.png', ring: 1 },
  { min: 1260, name: 'Insane III',      face: 'diffIcon_05_btn_001.png', ring: 2 },
  { min: 1420, name: 'Easy Demon I',    face: 'diffIcon_07_btn_001.png', ring: 0 },
  { min: 1600, name: 'Easy Demon II',   face: 'diffIcon_07_btn_001.png', ring: 1 },
  { min: 1800, name: 'Easy Demon III',  face: 'diffIcon_07_btn_001.png', ring: 2 },
  { min: 2020, name: 'Hard Demon I',    face: 'diffIcon_06_btn_001.png', ring: 0 },
  { min: 2260, name: 'Hard Demon II',   face: 'diffIcon_06_btn_001.png', ring: 1 },
  { min: 2520, name: 'Hard Demon III',  face: 'diffIcon_06_btn_001.png', ring: 2 },
  { min: 2800, name: 'Extreme Demon I',   face: 'diffIcon_10_btn_001.png', ring: 0 },
  { min: 3150, name: 'Extreme Demon II',  face: 'diffIcon_10_btn_001.png', ring: 1 },
  { min: 3500, name: 'Extreme Demon III', face: 'diffIcon_10_btn_001.png', ring: 2 }
];

function getRankForPoints(pts) {
  const p = Math.max(0, Number(pts) || 0);
  let current = RANK_TIERS[0];
  for (const t of RANK_TIERS) {
    if (p >= t.min) current = t;
  }
  return current;
}

function sanitizeUser(u) {
  if (!u) return null;
  const rankedPoints = u.rankedPoints !== undefined ? u.rankedPoints : (u.listPoints || 0);
  const unrankedPoints = u.unrankedPoints !== undefined ? u.unrankedPoints : (u.listPoints || 0);
  return {
    id: u.id,
    username: u.username,
    rankedPoints,
    unrankedPoints,
    listPoints: rankedPoints,
    rankInfo: getRankForPoints(rankedPoints),
    rankedWins: u.rankedWins || 0,
    rankedLosses: u.rankedLosses || 0,
    unrankedWins: u.unrankedWins || u.wins || 0,
    unrankedLosses: u.unrankedLosses || u.losses || 0,
    wins: (u.rankedWins || 0) + (u.unrankedWins || u.wins || 0),
    losses: (u.rankedLosses || 0) + (u.unrankedLosses || u.losses || 0),
    lastIcon: u.lastIcon || { player: 'player_01', mainColor: '04FF00', secondaryColor: '00FBFF' }
  };
}

function getUserFromReq(req) {
  const token = req.cookies?.wd_session || req.headers['x-session-token'];
  if (!token || !db.sessions[token]) return null;
  const userId = db.sessions[token];
  return db.users.find(u => u.id === userId) || null;
}

// --- AUTH & ACCOUNT API ---
app.get('/api/auth/me', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: sanitizeUser(user), browserId: req.browserId });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, email, password, lastIcon } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const cleanName = String(username).trim();
    if (cleanName.length < 3 || cleanName.length > 20 || !/^[a-zA-Z0-9_-]+$/.test(cleanName)) {
      return res.status(400).json({ error: 'Username must be 3-20 alphanumeric characters' });
    }
    if (String(password).length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters' });
    }
    if (db.users.find(u => u.username.toLowerCase() === cleanName.toLowerCase())) {
      return res.status(400).json({ error: 'Username already taken' });
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    const newUser = {
      id: db.users.length > 0 ? Math.max(...db.users.map(u => u.id)) + 1 : 1,
      username: cleanName,
      email: email || '',
      passwordHash,
      rankedPoints: 0,
      unrankedPoints: 0,
      listPoints: 0,
      rankedWins: 0,
      rankedLosses: 0,
      unrankedWins: 0,
      unrankedLosses: 0,
      wins: 0,
      losses: 0,
      lastIcon: lastIcon || { player: 'player_01', mainColor: '04FF00', secondaryColor: '00FBFF' },
      saveData: {},
      createdAt: new Date().toISOString()
    };
    db.users.push(newUser);
    const token = crypto.randomUUID();
    db.sessions[token] = newUser.id;
    saveDB();
    res.cookie('wd_session', token, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
    res.json({ user: sanitizeUser(newUser), token });
  } catch (err) {
    res.status(500).json({ error: 'Registration error' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = db.users.find(u => u.username.toLowerCase() === String(username || '').trim().toLowerCase());
    if (!user || !(await bcrypt.compare(String(password || ''), user.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const token = crypto.randomUUID();
    db.sessions[token] = user.id;
    saveDB();
    res.cookie('wd_session', token, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
    res.json({ user: sanitizeUser(user), token });
  } catch (err) {
    res.status(500).json({ error: 'Login error' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.wd_session;
  if (token && db.sessions[token]) {
    delete db.sessions[token];
    saveDB();
  }
  res.clearCookie('wd_session');
  res.json({ ok: true });
});

app.get('/api/saves', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ save: user.saveData || {} });
});

app.post('/api/saves', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  const save = req.body.save || {};
  user.saveData = save;
  if (save.iconCurrentPlayer || save.iconMainColor || save.iconSecondaryColor) {
    user.lastIcon = {
      player: save.iconCurrentPlayer || user.lastIcon?.player || 'player_01',
      mainColor: (save.iconMainColor || user.lastIcon?.mainColor || '04FF00').replace(/^#/, ''),
      secondaryColor: (save.iconSecondaryColor || user.lastIcon?.secondaryColor || '00FBFF').replace(/^#/, '')
    };
  }
  saveDB();
  res.json({ ok: true });
});

app.post('/api/sync-icon', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  const { player, mainColor, secondaryColor } = req.body;
  user.lastIcon = {
    player: player || user.lastIcon?.player || 'player_01',
    mainColor: String(mainColor || user.lastIcon?.mainColor || '04FF00').replace(/^#/, '').toUpperCase(),
    secondaryColor: String(secondaryColor || user.lastIcon?.secondaryColor || '00FBFF').replace(/^#/, '').toUpperCase()
  };
  saveDB();
  res.json({ ok: true, lastIcon: user.lastIcon });
});

app.get('/api/leaderboard', (req, res) => {
  const ranked = [...db.users]
    .map(u => sanitizeUser(u))
    .sort((a, b) => b.rankedPoints - a.rankedPoints || b.rankedWins - a.rankedWins)
    .slice(0, 100)
    .map((u, idx) => ({ ...u, rank: idx + 1 }));

  const unranked = [...db.users]
    .map(u => sanitizeUser(u))
    .sort((a, b) => b.unrankedPoints - a.unrankedPoints || b.unrankedWins - a.unrankedWins)
    .slice(0, 100)
    .map((u, idx) => ({ ...u, rank: idx + 1 }));

  res.json({
    leaderboard: ranked,
    rankedLeaderboard: ranked,
    unrankedLeaderboard: unranked,
    levels: MAIN_LEVELS,
    rankTiers: RANK_TIERS
  });
});

// --- ANTI-CHEAT: RANKED PAIR COOLDOWN & BROWSER ISOLATION ---
// Only Ranked mode has the 15-minute pair cooldown (max 2 ranked wins vs same opponent per 15 mins)
const rankedPairHistory = new Map(); // "winnerId:loserId" -> [timestamp1, timestamp2, ...]

function canEarnRankedPointsAgainst(winnerId, loserId) {
  if (!winnerId || !loserId) return false;
  if (winnerId === loserId) return false;
  const key = `${winnerId}:${loserId}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const history = (rankedPairHistory.get(key) || []).filter(ts => now - ts < windowMs);
  if (history.length >= 2) {
    return false;
  }
  history.push(now);
  rankedPairHistory.set(key, history);
  return true;
}

function isSamePlayerOrBrowser(sockA, sockB) {
  if (!sockA || !sockB) return true;
  if (sockA.id === sockB.id) return true;
  const uA = sockA.userData;
  const uB = sockB.userData;
  if (uA.userId && uB.userId && uA.userId === uB.userId) return true;
  if (uA.username && uB.username && uA.username.toLowerCase() === uB.username.toLowerCase()) return true;
  if (uA.browserId && uB.browserId && uA.browserId === uB.browserId) return true;
  return false;
}

// --- REAL-TIME 1v1 VERSUS, QUEUE MATCHMAKING & GLOBED GHOST SERVER ---
const rooms = new Map();
const rankedQueue = [];   // array of sockets
const unrankedQueue = []; // array of sockets

function removeFromQueues(socket) {
  const rIdx = rankedQueue.indexOf(socket);
  if (rIdx !== -1) rankedQueue.splice(rIdx, 1);
  const uIdx = unrankedQueue.indexOf(socket);
  if (uIdx !== -1) unrankedQueue.splice(uIdx, 1);
}

function broadcastQueueCounts() {
  io.emit('versus:queue_counts', {
    rankedInQueue: rankedQueue.length,
    unrankedInQueue: unrankedQueue.length
  });
}

function getPublicRoomsList() {
  const list = [];
  for (const r of rooms.values()) {
    if (r.state === 'waiting' && r.players.size < 2 && r.isPublic) {
      const host = Array.from(r.players.values())[0];
      const lvl = MAIN_LEVELS.find(l => l.id === r.levelId) || MAIN_LEVELS[0];
      const rule = RULE_MODES[r.ruleMode] || RULE_MODES.race;
      list.push({
        id: r.id,
        hostName: host ? host.username : 'Player',
        hostPoints: host ? (r.isRanked ? host.rankedPoints : host.unrankedPoints) : 0,
        hostRank: host ? host.rankInfo : getRankForPoints(0),
        levelId: lvl.id,
        levelName: lvl.name,
        difficulty: lvl.difficulty,
        points: lvl.points,
        ruleMode: rule.id,
        ruleName: rule.name,
        isRanked: !!r.isRanked
      });
    }
  }
  return list;
}

function serializeRoom(room) {
  if (!room) return null;
  const lvl = MAIN_LEVELS.find(l => l.id === room.levelId) || MAIN_LEVELS[0];
  const rule = RULE_MODES[room.ruleMode] || RULE_MODES.race;
  return {
    id: room.id,
    hostId: room.hostId,
    level: lvl,
    ruleMode: rule.id,
    ruleName: rule.name,
    ruleDesc: rule.desc,
    isPublic: room.isPublic,
    isRanked: !!room.isRanked,
    state: room.state,
    winner: room.winner || null,
    players: Array.from(room.players.values())
  };
}

function createPlayerEntry(socket) {
  return {
    socketId: socket.id,
    userId: socket.userData.userId,
    username: socket.userData.username,
    browserId: socket.userData.browserId,
    rankedPoints: socket.userData.rankedPoints || 0,
    unrankedPoints: socket.userData.unrankedPoints || 0,
    listPoints: socket.userData.rankedPoints || 0,
    rankInfo: getRankForPoints(socket.userData.rankedPoints || 0),
    lastIcon: socket.userData.lastIcon,
    percent: 0,
    bestPercent: 0,
    attempts: 1,
    jumpsCount: 0,
    completed: false,
    completedAttempts: null,
    exhaustedAttempts: false
  };
}

function tryMatchQueue(isRanked) {
  const q = isRanked ? rankedQueue : unrankedQueue;
  if (q.length < 2) return;

  for (let i = 0; i < q.length; i++) {
    for (let j = i + 1; j < q.length; j++) {
      const s1 = q[i];
      const s2 = q[j];
      if (!isSamePlayerOrBrowser(s1, s2)) {
        // Pair found! Remove both from queue
        q.splice(j, 1);
        q.splice(i, 1);
        broadcastQueueCounts();

        // Pick an appropriate level for the match
        let pool = MAIN_LEVELS.slice(0, 10); // Easy to Insane pool by default
        if (isRanked) {
          const avgPts = ((s1.userData.rankedPoints || 0) + (s2.userData.rankedPoints || 0)) / 2;
          if (avgPts >= 900) pool = MAIN_LEVELS.slice(9, 22); // Harder/Insane/Demon for high ranks
          else if (avgPts >= 340) pool = MAIN_LEVELS.slice(4, 17);
        }
        const chosenLevel = pool[Math.floor(Math.random() * pool.length)] || MAIN_LEVELS[0];

        const roomId = 'Q' + Math.random().toString(36).substring(2, 6).toUpperCase();
        const room = {
          id: roomId,
          hostId: s1.id,
          levelId: chosenLevel.id,
          ruleMode: 'race',
          isPublic: false,
          isRanked: isRanked,
          state: 'playing',
          startedAt: Date.now(),
          players: new Map(),
          winner: null
        };
        room.players.set(s1.id, createPlayerEntry(s1));
        room.players.set(s2.id, createPlayerEntry(s2));
        rooms.set(roomId, room);

        s1.join(roomId);
        s2.join(roomId);
        s1.roomId = roomId;
        s2.roomId = roomId;

        io.to(roomId).emit('versus:match_start', serializeRoom(room));
        return;
      }
    }
  }
}

io.on('connection', (socket) => {
  socket.userData = {
    username: 'Guest_' + socket.id.slice(0, 4),
    userId: null,
    browserId: null,
    rankedPoints: 0,
    unrankedPoints: 0,
    rankInfo: getRankForPoints(0),
    lastIcon: { player: 'player_01', mainColor: '04FF00', secondaryColor: '00FBFF' }
  };

  socket.on('versus:auth', (data = {}) => {
    let user = null;
    if (data.username) {
      user = db.users.find(u => u.username.toLowerCase() === String(data.username).toLowerCase());
    }
    if (user) {
      if (data.lastIcon) {
        user.lastIcon = data.lastIcon;
        saveDB();
      }
      const clean = sanitizeUser(user);
      socket.userData = {
        userId: clean.id,
        username: clean.username,
        browserId: data.browserId || socket.userData.browserId || socket.id,
        rankedPoints: clean.rankedPoints,
        unrankedPoints: clean.unrankedPoints,
        rankInfo: clean.rankInfo,
        lastIcon: clean.lastIcon
      };
    } else {
      socket.userData.username = data.username || socket.userData.username;
      socket.userData.browserId = data.browserId || socket.userData.browserId || socket.id;
      if (data.lastIcon) socket.userData.lastIcon = data.lastIcon;
    }
    socket.emit('versus:authed', {
      user: socket.userData,
      levels: MAIN_LEVELS,
      rooms: getPublicRoomsList(),
      rankedInQueue: rankedQueue.length,
      unrankedInQueue: unrankedQueue.length
    });
  });

  socket.on('versus:join_queue', ({ isRanked }) => {
    if (isRanked && !socket.userData.userId) {
      return socket.emit('versus:error', { message: 'You must be logged into an account to play Ranked Mode!' });
    }
    leaveCurrentRoom(socket);
    removeFromQueues(socket);

    const targetQueue = isRanked ? rankedQueue : unrankedQueue;
    // Anti-Cheat: prevent same user or same browser instance from queuing twice
    if (targetQueue.some(s => isSamePlayerOrBrowser(s, socket))) {
      return socket.emit('versus:error', { message: 'Anti-Cheat: Your account or browser is already in the queue!' });
    }

    targetQueue.push(socket);
    socket.emit('versus:queue_status', { inQueue: true, isRanked: !!isRanked });
    broadcastQueueCounts();
    tryMatchQueue(!!isRanked);
  });

  socket.on('versus:leave_queue', () => {
    removeFromQueues(socket);
    socket.emit('versus:queue_status', { inQueue: false });
    broadcastQueueCounts();
  });

  socket.on('versus:list_rooms', () => {
    socket.emit('versus:rooms_list', {
      rooms: getPublicRoomsList(),
      levels: MAIN_LEVELS,
      rankedInQueue: rankedQueue.length,
      unrankedInQueue: unrankedQueue.length
    });
  });

  socket.on('versus:create_room', (data = {}) => {
    if (data.isRanked && !socket.userData.userId) {
      return socket.emit('versus:error', { message: 'You must be logged into an account to host a Ranked match!' });
    }
    removeFromQueues(socket);
    leaveCurrentRoom(socket);
    const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const levelId = MAIN_LEVELS.some(l => l.id === data.levelId) ? data.levelId : 'level_1';
    const ruleMode = RULE_MODES[data.ruleMode] ? data.ruleMode : 'race';
    const room = {
      id: roomId,
      hostId: socket.id,
      levelId,
      ruleMode,
      isPublic: data.isPublic !== false,
      isRanked: !!data.isRanked,
      state: 'waiting',
      startedAt: null,
      players: new Map(),
      winner: null
    };
    room.players.set(socket.id, createPlayerEntry(socket));
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.roomId = roomId;
    socket.emit('versus:room_joined', serializeRoom(room));
    io.emit('versus:rooms_list', { rooms: getPublicRoomsList(), levels: MAIN_LEVELS });
  });

  socket.on('versus:join_room', ({ roomId }) => {
    const cleanId = String(roomId || '').trim().toUpperCase();
    const room = rooms.get(cleanId);
    if (!room) return socket.emit('versus:error', { message: 'Room not found!' });
    if (room.state !== 'waiting') return socket.emit('versus:error', { message: 'Match already in progress!' });
    if (room.players.size >= 2) return socket.emit('versus:error', { message: 'Room is full!' });
    if (room.isRanked && !socket.userData.userId) {
      return socket.emit('versus:error', { message: 'You must be logged into an account to join a Ranked room!' });
    }

    // ANTI-CHEAT: Check against host in room (No same name, no same account, no same browser tab/window!)
    const hostPlayer = Array.from(room.players.values())[0];
    if (hostPlayer) {
      if (hostPlayer.username.toLowerCase() === socket.userData.username.toLowerCase()) {
        return socket.emit('versus:error', { message: 'Anti-Cheat: Cannot join a lobby with the same username!' });
      }
      if (hostPlayer.userId && socket.userData.userId && hostPlayer.userId === socket.userData.userId) {
        return socket.emit('versus:error', { message: 'Anti-Cheat: Cannot play against your own account!' });
      }
      if (hostPlayer.browserId && socket.userData.browserId && hostPlayer.browserId === socket.userData.browserId) {
        return socket.emit('versus:error', { message: 'Anti-Cheat: Cannot play against another tab/window on the same browser!' });
      }
    }

    removeFromQueues(socket);
    leaveCurrentRoom(socket);
    room.players.set(socket.id, createPlayerEntry(socket));
    socket.join(cleanId);
    socket.roomId = cleanId;
    io.to(cleanId).emit('versus:room_updated', serializeRoom(room));
    io.emit('versus:rooms_list', { rooms: getPublicRoomsList(), levels: MAIN_LEVELS });
  });

  socket.on('versus:change_level', ({ levelId }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id || room.state !== 'waiting') return;
    if (MAIN_LEVELS.some(l => l.id === levelId)) {
      room.levelId = levelId;
      io.to(room.id).emit('versus:room_updated', serializeRoom(room));
      io.emit('versus:rooms_list', { rooms: getPublicRoomsList(), levels: MAIN_LEVELS });
    }
  });

  socket.on('versus:change_rule', ({ ruleMode }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id || room.state !== 'waiting') return;
    if (RULE_MODES[ruleMode]) {
      room.ruleMode = ruleMode;
      io.to(room.id).emit('versus:room_updated', serializeRoom(room));
      io.emit('versus:rooms_list', { rooms: getPublicRoomsList(), levels: MAIN_LEVELS });
    }
  });

  socket.on('versus:change_ranked', ({ isRanked }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id || room.state !== 'waiting') return;
    if (isRanked && !socket.userData.userId) {
      return socket.emit('versus:error', { message: 'Log into an account to enable Ranked mode!' });
    }
    room.isRanked = !!isRanked;
    io.to(room.id).emit('versus:room_updated', serializeRoom(room));
    io.emit('versus:rooms_list', { rooms: getPublicRoomsList(), levels: MAIN_LEVELS });
  });

  socket.on('versus:start_match', () => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.size < 2) {
      return socket.emit('versus:error', { message: 'Waiting for an opponent to join!' });
    }
    room.state = 'playing';
    room.startedAt = Date.now();
    room.winner = null;
    for (const p of room.players.values()) {
      p.percent = 0;
      p.bestPercent = 0;
      p.attempts = 1;
      p.jumpsCount = 0;
      p.completed = false;
      p.completedAttempts = null;
      p.exhaustedAttempts = false;
    }
    io.to(room.id).emit('versus:match_start', serializeRoom(room));
    io.emit('versus:rooms_list', { rooms: getPublicRoomsList(), levels: MAIN_LEVELS });
  });

  socket.on('versus:ghost', (ghostData) => {
    const rId = socket.roomId;
    if (!rId) return;
    const room = rooms.get(rId);
    if (room && room.state === 'playing') {
      const p = room.players.get(socket.id);
      if (p && ghostData.jumped) p.jumpsCount = (p.jumpsCount || 0) + 1;
    }
    socket.to(rId).emit('versus:opponent_ghost', {
      socketId: socket.id,
      username: socket.userData.username,
      lastIcon: socket.userData.lastIcon,
      x: ghostData.x,
      y: ghostData.y,
      angle: ghostData.angle || 0,
      dead: !!ghostData.dead
    });
  });

  socket.on('versus:progress', ({ percent, attempts, died, jumps }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.state !== 'playing' || room.winner) return;
    const player = room.players.get(socket.id);
    if (!player) return;

    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    const att = Math.max(1, Number(attempts) || 1);
    if (Number(jumps) > player.jumpsCount) player.jumpsCount = Number(jumps);

    if (room.ruleMode === 'max_attempts_4' && player.exhaustedAttempts) {
      return;
    }

    // Anti-Speedhack check: completing 100% in under 18 seconds is physically impossible on Main Levels
    const elapsedSec = (Date.now() - (room.startedAt || Date.now())) / 1000;
    if (pct >= 100 && elapsedSec < 18) {
      return socket.emit('versus:error', { message: 'Anti-Cheat: Speedhack / Instant Complete detected!' });
    }

    player.attempts = att;
    player.percent = died ? 0 : pct;
    if (pct > player.bestPercent) player.bestPercent = pct;

    if (pct >= 100 && !player.completed) {
      player.completed = true;
      player.completedAttempts = att;
      player.bestPercent = 100;
    }

    if (room.ruleMode === 'max_attempts_4') {
      if ((died && att >= 4) || att > 4 || player.completed) {
        player.exhaustedAttempts = true;
        player.attempts = Math.min(att, 4);
      }
    }

    io.to(room.id).emit('versus:state_sync', {
      players: Array.from(room.players.values())
    });

    evaluateWinCondition(room);
  });

  socket.on('versus:leave_room', () => leaveCurrentRoom(socket));
  socket.on('disconnect', () => {
    removeFromQueues(socket);
    broadcastQueueCounts();
    leaveCurrentRoom(socket);
  });

  function evaluateWinCondition(room) {
    if (!room || room.state !== 'playing' || room.winner) return;
    const players = Array.from(room.players.values());
    if (players.length < 2) return;
    const [p1, p2] = players;

    if (room.ruleMode === 'race') {
      const winner = players.find(p => p.completed);
      if (winner) finishMatch(room, winner, `${winner.username} reached 100% first!`);
    } else if (room.ruleMode === 'min_attempts') {
      if (p1.completed && p2.completed) {
        const winner = p1.completedAttempts <= p2.completedAttempts ? p1 : p2;
        finishMatch(room, winner, `${winner.username} beat 100% in ${winner.completedAttempts} attempt(s)!`);
      } else if (p1.completed && !p2.completed && p2.attempts > p1.completedAttempts) {
        finishMatch(room, p1, `${p1.username} won in ${p1.completedAttempts} attempt(s)!`);
      } else if (p2.completed && !p1.completed && p1.attempts > p2.completedAttempts) {
        finishMatch(room, p2, `${p2.username} won in ${p2.completedAttempts} attempt(s)!`);
      }
    } else if (room.ruleMode === 'max_attempts_4') {
      if (p1.exhaustedAttempts && p2.exhaustedAttempts) {
        const winner = p1.bestPercent >= p2.bestPercent ? p1 : p2;
        const loser = winner === p1 ? p2 : p1;
        finishMatch(room, winner, `${winner.username} reached ${Math.floor(winner.bestPercent)}% vs ${loser.username}'s ${Math.floor(loser.bestPercent)}% (4 Attempts)!`);
      }
    }
  }

  function finishMatch(room, winnerPlayer, reasonText) {
    room.state = 'finished';
    const lvl = MAIN_LEVELS.find(l => l.id === room.levelId) || MAIN_LEVELS[0];
    let loserPlayer = null;
    for (const p of room.players.values()) {
      if (p.socketId !== winnerPlayer.socketId) loserPlayer = p;
    }

    let awardedPoints = lvl.points;
    let antiCheatNote = '';

    // 1. Check same account / same browser
    const sameIdentity = (winnerPlayer.userId && loserPlayer && winnerPlayer.userId === loserPlayer.userId) ||
                         (winnerPlayer.browserId && loserPlayer && winnerPlayer.browserId === loserPlayer.browserId);

    // 2. Anti-AFK Friend Boosting Check: Opponent must reach at least 12% bestPercent or perform real jumps
    const loserIsAFK = loserPlayer && loserPlayer.bestPercent < 12 && (loserPlayer.jumpsCount || 0) < 4;

    if (sameIdentity) {
      awardedPoints = 0;
      antiCheatNote = ' (0 pts: Same Account/Browser)';
    } else if (loserIsAFK) {
      awardedPoints = 0;
      antiCheatNote = ' (0 pts: Opponent was AFK <12%!)';
    } else if (room.isRanked) {
      // Ranked Mode ONLY: 15-minute cooldown after 2 wins against the exact same friend
      if (!canEarnRankedPointsAgainst(winnerPlayer.userId, loserPlayer ? loserPlayer.userId : null)) {
        awardedPoints = 0;
        antiCheatNote = ' (0 Ranked pts: 15m Cooldown vs Same Opponent — Play Unranked or another player!)';
      }
    }

    if (winnerPlayer.userId && awardedPoints > 0) {
      const dbWin = db.users.find(u => u.id === winnerPlayer.userId);
      if (dbWin) {
        if (room.isRanked) {
          dbWin.rankedPoints = (dbWin.rankedPoints || 0) + awardedPoints;
          dbWin.listPoints = dbWin.rankedPoints;
          dbWin.rankedWins = (dbWin.rankedWins || 0) + 1;
          winnerPlayer.rankedPoints = dbWin.rankedPoints;
          winnerPlayer.rankInfo = getRankForPoints(dbWin.rankedPoints);
        } else {
          dbWin.unrankedPoints = (dbWin.unrankedPoints || 0) + awardedPoints;
          dbWin.unrankedWins = (dbWin.unrankedWins || 0) + 1;
          winnerPlayer.unrankedPoints = dbWin.unrankedPoints;
        }
      }
    }

    if (loserPlayer && loserPlayer.userId && !sameIdentity && !loserIsAFK) {
      const dbLoss = db.users.find(u => u.id === loserPlayer.userId);
      if (dbLoss) {
        if (room.isRanked) {
          dbLoss.rankedLosses = (dbLoss.rankedLosses || 0) + 1;
          // Small Ranked RP penalty on loss (never drops below 0)
          const lossPenalty = Math.min(dbLoss.rankedPoints || 0, Math.max(5, Math.round(lvl.points * 0.25)));
          if (awardedPoints > 0) {
            dbLoss.rankedPoints = Math.max(0, (dbLoss.rankedPoints || 0) - lossPenalty);
            dbLoss.listPoints = dbLoss.rankedPoints;
          }
        } else {
          dbLoss.unrankedLosses = (dbLoss.unrankedLosses || 0) + 1;
        }
      }
    }
    saveDB();

    room.winner = {
      socketId: winnerPlayer.socketId,
      username: winnerPlayer.username,
      isRanked: !!room.isRanked,
      pointsAwarded: awardedPoints,
      newTotalPoints: room.isRanked ? winnerPlayer.rankedPoints : winnerPlayer.unrankedPoints,
      rankInfo: winnerPlayer.rankInfo,
      levelName: lvl.name,
      reasonText: (reasonText || `${winnerPlayer.username} won on ${lvl.name}!`) + antiCheatNote
    };

    io.to(room.id).emit('versus:match_finished', serializeRoom(room));
  }

  function leaveCurrentRoom(sock) {
    const rId = sock.roomId;
    if (!rId) return;
    sock.leave(rId);
    sock.roomId = null;
    const room = rooms.get(rId);
    if (!room) return;

    const leavingPlayer = room.players.get(sock.id);
    room.players.delete(sock.id);

    if (room.players.size === 0) {
      rooms.delete(rId);
    } else {
      const remaining = Array.from(room.players.values())[0];
      room.hostId = remaining.socketId;
      if (room.state === 'playing' && !room.winner) {
        room.state = 'finished';
        const lvl = MAIN_LEVELS.find(l => l.id === room.levelId) || MAIN_LEVELS[0];
        room.winner = {
          socketId: remaining.socketId,
          username: remaining.username,
          isRanked: !!room.isRanked,
          pointsAwarded: 0,
          newTotalPoints: room.isRanked ? remaining.rankedPoints : remaining.unrankedPoints,
          rankInfo: remaining.rankInfo,
          levelName: lvl.name,
          forfeit: true,
          forfeitBy: leavingPlayer ? leavingPlayer.username : 'Opponent',
          reasonText: `${leavingPlayer ? leavingPlayer.username : 'Opponent'} left the match (Forfeit - 0 pts)!`
        };
        io.to(rId).emit('versus:match_finished', serializeRoom(room));
      } else {
        room.state = 'waiting';
        io.to(rId).emit('versus:room_updated', serializeRoom(room));
      }
    }
    io.emit('versus:rooms_list', { rooms: getPublicRoomsList(), levels: MAIN_LEVELS });
  }
});

app.use(express.static(__dirname));
app.get('/play', (req, res) => res.sendFile(path.join(__dirname, 'play.html')));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Web Dashers Versus Server running on http://localhost:${PORT}`);
});
