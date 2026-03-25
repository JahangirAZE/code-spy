const { createRoom, getRoom, removeRoom } = require('./gameState');
const { getScenario, listScenarios } = require('./scenarios');
const { generateRoomCode } = require('./roomCodeGenerator');

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 6;
const ALLOWED_TIMERS = [5, 8, 10];
const MAX_CHAT_MESSAGE_LENGTH = 100;
const MAX_CHAT_HISTORY = 100;

function canEditRegion(room, editorSocketId, targetPlayerId) {
  if (!room || room.state !== 'playing') return false;
  if (!room.players.some((p) => p.id === editorSocketId)) return false;
  if (!room.players.some((p) => p.id === targetPlayerId)) return false;

  return editorSocketId === targetPlayerId;
}

function handleConnection(socket, io) {
  console.log(`connected: ${socket.id}`);

  socket.on('create_room', ({ playerName }) => {
    const roomCode = generateRoomCode();
    const room = createRoom(roomCode, socket.id, playerName);

    room.timerMinutes = room.timerMinutes || 8;
    room.chatMessages = room.chatMessages || [];

    socket.join(roomCode);
    socket.emit('room_created', {
      roomCode,
      players: room.players,
      scenarios: listScenarios(),
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      timerMinutes: room.timerMinutes,
      chatMessages: room.chatMessages
    });

    console.log(`room ${roomCode} created by ${playerName}`);
  });

  socket.on('join_room', ({ roomCode, playerName }) => {
    const room = getRoom(roomCode);
    if (!room) return socket.emit('error', { message: 'Room not found.' });
    if (room.state !== 'lobby') return socket.emit('error', { message: 'Game already started.' });
    if (room.players.length >= room.maxPlayers) {
      return socket.emit('error', { message: 'Room is full.' });
    }

    room.chatMessages = room.chatMessages || [];
    room.players.push({ id: socket.id, name: playerName, ready: false });
    socket.join(roomCode);

    io.to(roomCode).emit('player_joined', {
      players: room.players,
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS
    });

    socket.emit('joined_room', {
      roomCode,
      players: room.players,
      isHost: false,
      scenarios: listScenarios(),
      minPlayers: MIN_PLAYERS,
      maxPlayers: MAX_PLAYERS,
      timerMinutes: room.timerMinutes,
      chatMessages: room.chatMessages
    });

    console.log(`${playerName} joined room ${roomCode}`);
  });

  socket.on('update_settings', ({ roomCode, language, scenario, timerMinutes }) => {
    const room = getRoom(roomCode);
    if (!room || room.hostId !== socket.id) return;

    if (language) room.language = language;
    if (scenario) room.scenario = scenario;

    if (timerMinutes !== undefined) {
      const parsedTimer = Number(timerMinutes);
      if (ALLOWED_TIMERS.includes(parsedTimer)) {
        room.timerMinutes = parsedTimer;
      }
    }

    io.to(roomCode).emit('settings_updated', {
      language: room.language,
      scenario: room.scenario,
      timerMinutes: room.timerMinutes
    });
  });

  socket.on('start_game', ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < room.minPlayers) {
      return socket.emit('error', { message: `Need at least ${room.minPlayers} players.` });
    }

    room.chatMessages = room.chatMessages || [];

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
    room.eliminatedPlayers = [];

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
        eliminatedPlayers: room.eliminatedPlayers,
        editorContent: room.editorContent,
        gameEndTime: room.gameEndTime,
        isSpy: p.id === room.spyId,
        chatMessages: room.chatMessages
      });
    });

    console.log(`game started in room ${roomCode}`);
    console.log(`spy: ${room.players.find((p) => p.id === room.spyId)?.name}`);

    if (room.gameTimeout) clearTimeout(room.gameTimeout);

    room.gameTimeout = setTimeout(() => {
      const r = getRoom(roomCode);
      if (r && r.state === 'playing') {
        endGame(r, roomCode, io, 'spy', 'Time ran out! The Spy survives — Spy wins!');
      }
    }, room.timerMinutes * 60 * 1000);
  });

  socket.on('region_update', ({ roomCode, targetPlayerId, content, version }) => {
    const room = getRoom(roomCode);
    if (!room || room.state !== 'playing') return;

    const isEliminated = room.eliminatedPlayers.some((p) => p.id === socket.id);
    if (isEliminated) {
      return socket.emit('edit_rejected', {
        targetPlayerId,
        message: 'You have been eliminated and cannot edit.'
      });
    }

    if (!canEditRegion(room, socket.id, targetPlayerId)) {
      return socket.emit('edit_rejected', {
        targetPlayerId,
        message: 'You cannot edit this region.'
      });
    }

    const serverVersion = room.editorVersions?.[targetPlayerId] || 0;
    const isSpy = room.spyId === socket.id;
    const isOwnRegion = socket.id === targetPlayerId;

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

    const isEliminated = room.eliminatedPlayers.some((p) => p.id === socket.id);
    if (isEliminated) {
      return socket.emit('error', { message: 'Eliminated players cannot call an emergency.' });
    }

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
    console.log(`emergency call in ${roomCode} by ${caller?.name}`);
  });

  socket.on('cast_vote', ({ roomCode, votedFor }) => {
    const room = getRoom(roomCode);
    if (!room || room.state !== 'voting') return;

    const isEliminated = room.eliminatedPlayers.some((p) => p.id === socket.id);
    if (isEliminated) return;

    room.votes[socket.id] = votedFor;

    const totalPlayers = room.players.length;
    const totalVotes = Object.keys(room.votes).length;

    io.to(roomCode).emit('vote_update', { votesIn: totalVotes, totalPlayers });

    const activePlayers = room.players.length;
    if (totalVotes === activePlayers) {
      resolveVote(room, roomCode, io);
    }
  });

  socket.on('chat_message', ({ roomCode, message }) => {
    const room = getRoom(roomCode);
    if (!room) return;

    const sender =
      room.players.find((p) => p.id === socket.id) ||
      room.eliminatedPlayers.find((p) => p.id === socket.id);

    if (!sender) return;

    const normalizedMessage = String(message || '').trim();
    if (!normalizedMessage) return;

    const safeMessage = normalizedMessage.slice(0, MAX_CHAT_MESSAGE_LENGTH);

    room.chatMessages = room.chatMessages || [];

    const chatItem = {
      id: `${socket.id}-${Date.now()}`,
      senderId: socket.id,
      senderName: sender.name,
      message: safeMessage,
      timestamp: Date.now()
    };

    room.chatMessages.push(chatItem);

    if (room.chatMessages.length > MAX_CHAT_HISTORY) {
      room.chatMessages = room.chatMessages.slice(-MAX_CHAT_HISTORY);
    }

    io.to(roomCode).emit('chat_message', chatItem);
  })

  socket.on('disconnect', () => {
    console.log(`disconnected: ${socket.id}`);

    for (const [code, room] of require('./gameState').rooms) {
      const playerIndex = room.players.findIndex((p) => p.id === socket.id);
      const isInEliminated = room.eliminatedPlayers.some((p) => p.id === socket.id);

      if (playerIndex === -1 && !isInEliminated) continue;

      const leavingPlayer = room.players[playerIndex];
      const isHost = room.hostId === socket.id;
      const isSpy = room.spyId === socket.id;
      const isActiveGame = room.state === 'playing' || room.state === 'voting';
      const isEnded = room.state === 'ended';

      if (isEnded) {
        if (playerIndex !== -1) {
          room.players.splice(playerIndex, 1);
        }

        if (room.players.length === 0) {
          removeRoom(code);
        }

        console.log(`player left ended room ${code}`);
        break;
      }

      if (isHost) {
        if (room.gameTimeout) {
          clearTimeout(room.gameTimeout);
          room.gameTimeout = null;
        }

        io.to(code).emit('host_disconnected', {
          hostName: leavingPlayer?.name || 'The host',
          wasInGame: isActiveGame
        });

        removeRoom(code);
        console.log(`host left room ${code} — room destroyed`);
        break;
      }

      if (isSpy && isActiveGame) {
        const spyPlayer =
          leavingPlayer ||
          room.eliminatedPlayers.find((p) => p.id === socket.id) ||
          { name: 'The Spy' };

        if (room.gameTimeout) {
          clearTimeout(room.gameTimeout);
          room.gameTimeout = null;
        }

        io.to(code).emit('spy_left', {
          spyName: spyPlayer.name,
          spyTask: room.taskCards[room.spyId],
          finalCode: room.editorContent,
          players: room.players.filter((p) => p.id !== socket.id),
          eliminatedPlayers: room.eliminatedPlayers
        });

        room.state = 'ended';
        console.log(`spy (${spyPlayer.name}) left room ${code}`);
        break;
      }

      if (playerIndex !== -1) {
        room.players.splice(playerIndex, 1);
      }

      io.to(code).emit('player_left', {
        players: room.players,
        leftId: socket.id,
        minPlayers: MIN_PLAYERS,
        maxPlayers: MAX_PLAYERS
      });

      if (room.players.length === 0) removeRoom(code);
      break;
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

    if (ejectedPlayer) {
      room.eliminatedPlayers.push({ id: ejectedPlayer.id, name: ejectedPlayer.name });
    }

    room.players = room.players.filter((p) => p.id !== ejected);

    const remainingPlayers = room.players;
    const spyStillAlive = remainingPlayers.some(p => p.id === room.spyId);

    if (wasTheSpy) {
      return endGame(
        room,
        roomCode,
        io,
        'coders',
        `${ejectedPlayer?.name} was the Spy! Coders win!`
      );
    }

    if (remainingPlayers.length === 2 && spyStillAlive) {
      return endGame(
        room,
        roomCode,
        io,
        'spy',
        'Only one coder left — Spy wins!'
      );
    }

    room.state = 'playing';
    io.to(roomCode).emit('vote_result', {
      ejected: ejectedPlayer?.name,
      ejectedId: ejected,
      wasTheSpy: false,
      players: room.players,
      eliminatedPlayers: room.eliminatedPlayers
    });
  }
}

function endGame(room, roomCode, io, winner, message) {
  if (room.gameTimeout) {
    clearTimeout(room.gameTimeout);
    room.gameTimeout = null;
  }

  room.state = 'ended';
  const spyPlayer = room.players.find((p) => p.id === room.spyId) || room.eliminatedPlayers.find((p) => p.id === room.spyId) || { name: 'Unknown', id: room.spyId };

  io.to(roomCode).emit('game_end', {
    winner,
    message,
    spyId: room.spyId,
    spyName: spyPlayer.name,
    spyTask: room.taskCards[room.spyId],
    finalCode: room.editorContent,
    players: room.players,
    eliminatedPlayers: room.eliminatedPlayers
  });
}

module.exports = { handleConnection, endGame };