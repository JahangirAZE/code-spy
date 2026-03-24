const { v4: uuidv4 } = require('uuid');
const { createRoom, getRoom, removeRoom } = require('./gameState');
const { getScenario, listScenarios } = require('./scenarios');

function generateRoomCode() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '0123456789';
  let code = 'SPY-';
  for (let i = 0; i < 2; i++) code += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 2; i++) code += digits[Math.floor(Math.random() * digits.length)];
  return code;
}

function canEditRegion(room, editorSocketId, targetPlayerId) {
  if (!room || room.state !== 'playing') return false;
  if (!room.players.some((p) => p.id === editorSocketId)) return false;
  if (!room.players.some((p) => p.id === targetPlayerId)) return false;

  return editorSocketId === targetPlayerId;
}

function handleConnection(socket, io) {
  console.log(`🔌 Connected: ${socket.id}`);

  socket.on('create_room', ({ playerName }) => {
    const roomCode = generateRoomCode();
    const room = createRoom(roomCode, socket.id, playerName);
    socket.join(roomCode);
    socket.emit('room_created', {
      roomCode,
      players: room.players,
      scenarios: listScenarios()
    });
    console.log(`🏠 Room ${roomCode} created by ${playerName}`);
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    const room = getRoom(roomCode);
    if (!room) return socket.emit('error', { message: 'Room not found.' });
    if (room.state !== 'lobby') return socket.emit('error', { message: 'Game already started.' });
    if (room.players.length >= 4) return socket.emit('error', { message: 'Room is full.' });

    room.players.push({ id: socket.id, name: playerName, ready: false });
    socket.join(roomCode);

    io.to(roomCode).emit('player_joined', { players: room.players });
    socket.emit('joined_room', {
      roomCode,
      players: room.players,
      isHost: false,
      scenarios: listScenarios()
    });
    console.log(`👤 ${playerName} joined room ${roomCode}`);
  });

  socket.on('update_settings', ({ roomCode, language, scenario, timerMinutes }) => {
    const room = getRoom(roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (language) room.language = language;
    if (scenario) room.scenario = scenario;
    if (timerMinutes) room.timerMinutes = timerMinutes;
    io.to(roomCode).emit('settings_updated', {
      language: room.language,
      scenario: room.scenario,
      timerMinutes: room.timerMinutes
    });
  });

  socket.on('start_game', ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) return socket.emit('error', { message: 'Need at least 2 players.' });

    const scenario = getScenario(room.scenario);

    const spyIndex = Math.floor(Math.random() * room.players.length);
    room.spyId = room.players[spyIndex].id;

    let coderTaskIndex = 0;
    room.players.forEach((p) => {
      if (p.id === room.spyId) {
        room.roles[p.id] = 'spy';
        room.taskCards[p.id] = scenario.spyTask;
      } else {
        room.roles[p.id] = 'coder';
        room.taskCards[p.id] = scenario.coderTasks[coderTaskIndex % scenario.coderTasks.length];
        coderTaskIndex++;
      }
      room.emergencyCalls[p.id] = 0;
    });

    room.editorContent = {};
    room.editorVersions = {};

    room.players.forEach((p) => {
      room.editorContent[p.id] = `// ===== ${p.name}'s region =====\n// Write your code here\n`;
      room.editorVersions[p.id] = 0;
    });

    room.state = 'playing';
    room.gameEndTime = Date.now() + room.timerMinutes * 60 * 1000;

    room.players.forEach((p) => {
      const playerSocket = io.sockets.sockets.get(p.id);
      if (!playerSocket) return;
      playerSocket.emit('game_started', {
        role: room.roles[p.id],
        taskCard: room.taskCards[p.id],
        skeleton: scenario.skeleton,
        scenario: { name: scenario.name, tests: scenario.tests },
        players: room.players,
        editorContent: room.editorContent,
        gameEndTime: room.gameEndTime,
        isSpy: p.id === room.spyId
      });
    });

    console.log(`🎮 Game started in room ${roomCode}. Spy: ${room.players.find((p) => p.id === room.spyId)?.name}`);

    setTimeout(() => {
      const r = getRoom(roomCode);
      if (r && r.state === 'playing') {
        endGame(r, roomCode, io, 'spy', 'Time ran out! The Spy survives — Spy wins!');
      }
    }, room.timerMinutes * 60 * 1000);
  });

  socket.on('region_update', ({ roomCode, targetPlayerId, content, version }) => {
    const room = getRoom(roomCode);
    if (!room || room.state !== 'playing') return;

    if (!canEditRegion(room, socket.id, targetPlayerId)) {
      return socket.emit('edit_rejected', {
        targetPlayerId,
        message: 'You cannot edit this region.'
      });
    }

    const isSpy = room.spyId === socket.id;
    const isOwnRegion = socket.id === targetPlayerId;
    const serverVersion = room.editorVersions?.[targetPlayerId] || 0;

    if (isSpy && !isOwnRegion && version !== undefined && version < serverVersion - 2) {
      return socket.emit('region_resync', {
        targetPlayerId,
        content: room.editorContent[targetPlayerId],
        version: serverVersion
      });
    }

    room.editorVersions[targetPlayerId] = serverVersion + 1;
    room.editorContent[targetPlayerId] = content;

    socket.to(roomCode).emit('region_updated', {
      editorId: socket.id,
      targetPlayerId,
      content,
      version: room.editorVersions[targetPlayerId]
    });
  });

  socket.on('emergency_call', ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (!room || room.state !== 'playing') return;
    if ((room.emergencyCalls[socket.id] || 0) >= 1) {
      return socket.emit('error', { message: 'You already used your Emergency Call.' });
    }

    room.emergencyCalls[socket.id] = (room.emergencyCalls[socket.id] || 0) + 1;
    room.state = 'voting';
    room.votes = {};
    room.votingInitiator = socket.id;
    room.discussionEndTime = Date.now() + 10 * 1000;

    const caller = room.players.find((p) => p.id === socket.id);
    io.to(roomCode).emit('freeze_editor', {
      calledBy: caller?.name || 'Someone',
      discussionEndTime: room.discussionEndTime
    });
    console.log(`🚨 Emergency call in ${roomCode} by ${caller?.name}`);
  });

  socket.on('cast_vote', ({ roomCode, votedFor }) => {
    const room = getRoom(roomCode);
    if (!room || room.state !== 'voting') return;
    room.votes[socket.id] = votedFor;

    const totalPlayers = room.players.length;
    const totalVotes = Object.keys(room.votes).length;

    io.to(roomCode).emit('vote_update', { votesIn: totalVotes, totalPlayers });

    if (totalVotes === totalPlayers) {
      resolveVote(room, roomCode, io);
    }
  });

  socket.on('disconnect', () => {
    console.log(`❌ Disconnected: ${socket.id}`);
    for (const [code, room] of require('./gameState').rooms) {
      const idx = room.players.findIndex((p) => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        io.to(code).emit('player_left', { players: room.players, leftId: socket.id });
        if (room.players.length === 0) removeRoom(code);
        break;
      }
    }
  });
}

function resolveVote(room, roomCode, io) {
  const voteCounts = {};
  room.players.forEach((p) => { voteCounts[p.id] = 0; });
  voteCounts.skip = 0;

  Object.values(room.votes).forEach((v) => {
    if (voteCounts[v] !== undefined) voteCounts[v]++;
    else voteCounts.skip++;
  });

  let maxVotes = 0;
  let ejected = null;
  let tied = false;

  Object.entries(voteCounts).forEach(([id, count]) => {
    if (id === 'skip') return;
    if (count > maxVotes) {
      maxVotes = count;
      ejected = id;
      tied = false;
    } else if (count === maxVotes && count > 0) {
      tied = true;
    }
  });

  const skipCount = voteCounts.skip || 0;
  if (tied || skipCount >= maxVotes) ejected = null;

  if (ejected) {
    const ejectedPlayer = room.players.find((p) => p.id === ejected);
    const wasTheSpy = ejected === room.spyId;
    room.players = room.players.filter((p) => p.id !== ejected);

    if (wasTheSpy) {
      endGame(room, roomCode, io, 'coders', `${ejectedPlayer?.name} was the Spy! Coders win!`);
    } else {
      room.state = 'playing';
      io.to(roomCode).emit('vote_result', {
        ejected: ejectedPlayer?.name,
        wasTheSpy: false,
        players: room.players
      });
    }
  } else {
    room.state = 'playing';
    io.to(roomCode).emit('vote_result', { ejected: null, players: room.players });
  }
}

function endGame(room, roomCode, io, winner, message) {
  room.state = 'ended';
  const spyPlayer = room.players.find((p) => p.id === room.spyId) || {
    name: 'Unknown',
    id: room.spyId
  };

  io.to(roomCode).emit('game_end', {
    winner,
    message,
    spyName: spyPlayer.name,
    spyTask: room.taskCards[room.spyId],
    finalCode: room.editorContent,
    players: room.players
  });
}

module.exports = { handleConnection, endGame };