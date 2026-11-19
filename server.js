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
  { id: 'level_1',  internal: 'stereo_madness',         name: 'Stereo Madness',         difficulty: 'Easy',   points: 5,   author: ['RobTop', 'Forever Bound'] },
  { id: 'level_2',  internal: 'back_on_track',          name: 'Back On Track',          difficulty: 'Easy',   points: 5,   author: ['RobTop', 'DJVI'] },
  { id: 'level_3',  internal: 'polargeist',             name: 'Polargeist',             difficulty: 'Normal', points: 10,  author: ['RobTop', 'Step'] },
  { id: 'level_4',  internal: 'dry_out',                name: 'Dry Out',                difficulty: 'Normal', points: 10,  author: ['RobTop', 'DJVI'] },
  { id: 'level_5',  internal: 'base_after_base',        name: 'Base After Base',        difficulty: 'Hard',   points: 15,  author: ['RobTop', 'DJVI'] },
  { id: 'level_6',  internal: 'cant_let_go',            name: 'Cant Let Go',            difficulty: 'Hard',   points: 20,  author: ['RobTop', 'DJVI'] },
  { id: 'level_7',  internal: 'jumper',                 name: 'Jumper',                 difficulty: 'Harder', points: 25,  author: ['RobTop', 'Waterflame'] },
  { id: 'level_8',  internal: 'time_machine',           name: 'Time Machine',           difficulty: 'Harder', points: 30,  author: ['RobTop', 'Waterflame'] },
  { id: 'level_9',  internal: 'cycles',                 name: 'Cycles',                 difficulty: 'Harder', points: 30,  author: ['RobTop', 'DJVI'] },
  { id: 'level_10', internal: 'xstep',                  name: 'xStep',                  difficulty: 'Insane', points: 40,  author: ['RobTop', 'DJVI'] },
  { id: 'level_11', internal: 'clutterfunk',            name: 'Clutterfunk',            difficulty: 'Insane', points: 50,  author: ['RobTop', 'Waterflame'] },
  { id: 'level_12', internal: 'theory_of_everything',   name: 'Theory Of Everything',   difficulty: 'Insane', points: 45,  author: ['RobTop', 'DJ-Nate'] },
  { id: 'level_13', internal: 'electroman_adventures',  name: 'Electroman Adventures',  difficulty: 'Insane', points: 45,  author: ['RobTop', 'Waterflame'] },
  { id: 'level_14', internal: 'clubstep',               name: 'Clubstep',               difficulty: 'Demon',  points: 100, author: ['RobTop', 'DJ-Nate'] },
  { id: 'level_15', internal: 'electrodynamix',         name: 'Electrodynamix',         difficulty: 'Insane', points: 70,  author: ['RobTop', 'DJ-Nate'] },
  { id: 'level_16', internal: 'hexagon_force',          name: 'Hexagon Force',          difficulty: 'Insane', points: 65,  author: ['RobTop', 'Waterflame'] },
  { id: 'level_17', internal: 'blast_processing',       name: 'Blast Processing',       difficulty: 'Harder', points: 35,  author: ['RobTop', 'Waterflame'] },
  { id: 'level_18', internal: 'theory_of_everything_2', name: 'Theory Of Everything 2', difficulty: 'Demon',  points: 110, author: ['RobTop', 'DJ-Nate'] },
  { id: 'level_19', internal: 'geometrical_dominator',  name: 'Geometrical Dominator',  difficulty: 'Harder', points: 35,  author: ['RobTop', 'Waterflame'] },
  { id: 'level_20', internal: 'deadlocked',             name: 'Deadlocked',             difficulty: 'Demon',  points: 125, author: ['RobTop', 'F-777'] },
  { id: 'level_21', internal: 'fingerdash',             name: 'Fingerdash',             difficulty: 'Insane', points: 50,  author: ['RobTop', 'MDK'] },
  { id: 'level_22', internal: 'dash',                   name: 'Dash',                   difficulty: 'Insane', points: 55,  author: ['RobTop', 'MDK'] }
];

const RULE_MODES = {
  race: { id: 'race', name: 'First to 100% (Standard Race)', desc: 'First player to reach 100% wins!' },
  min_attempts: { id: 'min_attempts', name: 'Min Attempts (Fewest Attempts at 100%)', desc: 'Reach 100% in fewer attempts than your opponent!' },
  max_attempts_4: { id: 'max_attempts_4', name: 'Max 4 Attempts (Furthest % Wins)', desc: 'You only get 4 attempts! Whoever gets the furthest % wins!' }
};

function sanitizeUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    listPoints: u.listPoints || 0,
    wins: u.wins || 0,
    losses: u.losses || 0,
    lastIcon: u.lastIcon || { player: 'player_01', mainColor: '04FF00', secondaryColor: '00FBFF' }
  };
}

function getUserFromReq(req) {
  const token = req.cookies?.wd_session || req.headers['x-session-token'];
  if (!token || !db.sessions[token]) return null;
  const userId = db.sessions[token];
  return db.users.find(u => u.id === userId) || null;
}

app.get('/api/auth/me', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: sanitizeUser(user) });
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
      listPoints: 0,
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
  const sorted = [...db.users]
    .sort((a, b) => (b.listPoints || 0) - (a.listPoints || 0) || (b.wins || 0) - (a.wins || 0))
    .slice(0, 100)
    .map((u, idx) => ({
      rank: idx + 1,
      username: u.username,
      listPoints: u.listPoints || 0,
      wins: u.wins || 0,
      losses: u.losses || 0,
      lastIcon: u.lastIcon || { player: 'player_01', mainColor: '04FF00', secondaryColor: '00FBFF' }
    }));
  res.json({ leaderboard: sorted, levels: MAIN_LEVELS });
});

// --- REAL-TIME 1v1 VERSUS & GLOBED GHOST SERVER ---
const rooms = new Map();

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
        hostPoints: host ? host.listPoints : 0,
        levelId: lvl.id,
        levelName: lvl.name,
        difficulty: lvl.difficulty,
        points: lvl.points,
        ruleMode: rule.id,
        ruleName: rule.name
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
    state: room.state,
    winner: room.winner || null,
    players: Array.from(room.players.values())
  };
}

io.on('connection', (socket) => {
  socket.userData = {
    username: 'Guest_' + socket.id.slice(0, 4),
    userId: null,
    listPoints: 0,
    lastIcon: { player: 'player_01', mainColor: '04FF00', secondaryColor: '00FBFF' }
  };

  socket.on('versus:auth', (data) => {
    let user = null;
    if (data && data.username) {
      user = db.users.find(u => u.username.toLowerCase() === String(data.username).toLowerCase());
    }
    if (user) {
      if (data.lastIcon) {
        user.lastIcon = data.lastIcon;
        saveDB();
      }
      socket.userData = {
        userId: user.id,
        username: user.username,
        listPoints: user.listPoints || 0,
        wins: user.wins || 0,
        losses: user.losses || 0,
        lastIcon: user.lastIcon || { player: 'player_01', mainColor: '04FF00', secondaryColor: '00FBFF' }
      };
    } else if (data) {
      socket.userData.username = data.username || socket.userData.username;
      if (data.lastIcon) socket.userData.lastIcon = data.lastIcon;
    }
    socket.emit('versus:authed', { user: socket.userData, levels: MAIN_LEVELS, rooms: getPublicRoomsList() });
  });

  socket.on('versus:list_rooms', () => {
    socket.emit('versus:rooms_list', { rooms: getPublicRoomsList(), levels: MAIN_LEVELS });
  });

  socket.on('versus:create_room', (data = {}) => {
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
      state: 'waiting',
      players: new Map(),
      winner: null
    };
    room.players.set(socket.id, {
      socketId: socket.id,
      userId: socket.userData.userId,
      username: socket.userData.username,
      listPoints: socket.userData.listPoints,
      lastIcon: socket.userData.lastIcon,
      percent: 0,
      bestPercent: 0,
      attempts: 1,
      completed: false,
      completedAttempts: null,
      exhaustedAttempts: false
    });
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

    leaveCurrentRoom(socket);
    room.players.set(socket.id, {
      socketId: socket.id,
      userId: socket.userData.userId,
      username: socket.userData.username,
      listPoints: socket.userData.listPoints,
      lastIcon: socket.userData.lastIcon,
      percent: 0,
      bestPercent: 0,
      attempts: 1,
      completed: false,
      completedAttempts: null,
      exhaustedAttempts: false
    });
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

  socket.on('versus:start_match', () => {
    const room = rooms.get(socket.roomId);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.size < 2) {
      return socket.emit('versus:error', { message: 'Waiting for an opponent to join!' });
    }
    room.state = 'playing';
    room.winner = null;
    for (const p of room.players.values()) {
      p.percent = 0;
      p.bestPercent = 0;
      p.attempts = 1;
      p.completed = false;
      p.completedAttempts = null;
      p.exhaustedAttempts = false;
    }
    io.to(room.id).emit('versus:match_start', serializeRoom(room));
    io.emit('versus:rooms_list', { rooms: getPublicRoomsList(), levels: MAIN_LEVELS });
  });

  // GLOBED REAL-TIME GHOST RELAY (30-60Hz position, rotation & icon state)
  socket.on('versus:ghost', (ghostData) => {
    const rId = socket.roomId;
    if (!rId) return;
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

  socket.on('versus:progress', ({ percent, attempts, died }) => {
    const room = rooms.get(socket.roomId);
    if (!room || room.state !== 'playing' || room.winner) return;
    const player = room.players.get(socket.id);
    if (!player) return;

    const pct = Math.max(0, Math.min(100, Number(percent) || 0));
    const att = Math.max(1, Number(attempts) || 1);

    // If in max_attempts_4 and already used 4 attempts, lock progress
    if (room.ruleMode === 'max_attempts_4' && player.exhaustedAttempts) {
      return;
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
      // If player died on attempt 4 or moved to attempt 5, or completed 100%
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
  socket.on('disconnect', () => leaveCurrentRoom(socket));

  function evaluateWinCondition(room) {
    if (!room || room.state !== 'playing' || room.winner) return;
    const players = Array.from(room.players.values());
    if (players.length < 2) return;
    const [p1, p2] = players;

    if (room.ruleMode === 'race') {
      const winner = players.find(p => p.completed);
      if (winner) finishMatch(room, winner, `${winner.username} reached 100% first!`);
    } else if (room.ruleMode === 'min_attempts') {
      // Fewest attempts to 100% wins!
      if (p1.completed && p2.completed) {
        const winner = p1.completedAttempts <= p2.completedAttempts ? p1 : p2;
        finishMatch(room, winner, `${winner.username} beat 100% in only ${winner.completedAttempts} attempt(s)!`);
      } else if (p1.completed && !p2.completed) {
        if (p2.attempts > p1.completedAttempts) {
          finishMatch(room, p1, `${p1.username} won in ${p1.completedAttempts} attempt(s) (Opponent is on attempt ${p2.attempts})!`);
        }
      } else if (p2.completed && !p1.completed) {
        if (p1.attempts > p2.completedAttempts) {
          finishMatch(room, p2, `${p2.username} won in ${p2.completedAttempts} attempt(s) (Opponent is on attempt ${p1.attempts})!`);
        }
      }
    } else if (room.ruleMode === 'max_attempts_4') {
      // Both players get 4 attempts to get as far as possible!
      if (p1.exhaustedAttempts && p2.exhaustedAttempts) {
        const winner = p1.bestPercent >= p2.bestPercent ? p1 : p2;
        const loser = winner === p1 ? p2 : p1;
        finishMatch(room, winner, `${winner.username} reached ${Math.floor(winner.bestPercent)}% vs ${loser.username}'s ${Math.floor(loser.bestPercent)}% (4 Attempts Max)!`);
      }
    }
  }

  function finishMatch(room, winnerPlayer, reasonText) {
    room.state = 'finished';
    const lvl = MAIN_LEVELS.find(l => l.id === room.levelId) || MAIN_LEVELS[0];
    const pointsWon = lvl.points;

    let loserPlayer = null;
    for (const p of room.players.values()) {
      if (p.socketId !== winnerPlayer.socketId) loserPlayer = p;
    }

    const sameAccount = winnerPlayer.userId && loserPlayer && winnerPlayer.userId === loserPlayer.userId;
    const awardedPoints = sameAccount ? 0 : pointsWon;

    if (winnerPlayer.userId && !sameAccount) {
      const dbWin = db.users.find(u => u.id === winnerPlayer.userId);
      if (dbWin) {
        dbWin.listPoints = (dbWin.listPoints || 0) + awardedPoints;
        dbWin.wins = (dbWin.wins || 0) + 1;
        winnerPlayer.listPoints = dbWin.listPoints;
      }
    }
    if (loserPlayer && loserPlayer.userId && !sameAccount) {
      const dbLoss = db.users.find(u => u.id === loserPlayer.userId);
      if (dbLoss) dbLoss.losses = (dbLoss.losses || 0) + 1;
    }
    saveDB();

    room.winner = {
      socketId: winnerPlayer.socketId,
      username: winnerPlayer.username,
      pointsAwarded: awardedPoints,
      newTotalPoints: winnerPlayer.listPoints,
      levelName: lvl.name,
      reasonText: reasonText || `${winnerPlayer.username} won on ${lvl.name}!`
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
          pointsAwarded: 0,
          newTotalPoints: remaining.listPoints,
          levelName: lvl.name,
          forfeit: true,
          forfeitBy: leavingPlayer ? leavingPlayer.username : 'Opponent',
          reasonText: `${leavingPlayer ? leavingPlayer.username : 'Opponent'} forfeited the match!`
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
