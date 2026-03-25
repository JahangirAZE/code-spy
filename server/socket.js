const { createRoom, getRoom, removeRoom, rooms } = require('./gameState');
const { getScenario, listScenarios } = require('./scenarios');
const { generateRoomCode } = require('./roomCodeGenerator');
const { runJavaTests } = require('./javaRunner');

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 6;
const ALLOWED_TIMERS = [5, 8, 10];
const MAX_CHAT_MESSAGE_LENGTH = 100;
const MAX_CHAT_HISTORY = 100;

function buildTaskCard(scenario, taskId, role) {
  const task = scenario.tasks[taskId];
  if (!task) return null;

  if (role === 'spy') {
    return {
      id: task.id,
      title: task.title,
      method: task.method,
      sabotage: task.sabotage,
      cover: task.cover,
      visibleTests: task.visibleTests || [],
      dependsOn: task.dependsOn || []
    };
  }

  return {
    id: task.id,
    title: task.title,
    method: task.method,
    rules: task.rules || [],
    hint: task.hint || '',
    visibleTests: task.visibleTests || [],
    dependsOn: task.dependsOn || []
  };
}

function getCompletedTaskCount(room) {
  return Object.values(room.taskStatus).filter((value) => value === 'passed').length;
}

function getTotalTaskCount(room) {
  return Object.keys(room.taskStatus).length;
}

function buildProgressPayload(room) {
  const total = getTotalTaskCount(room);
  const completed = getCompletedTaskCount(room);

  return {
    completed,
    total,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    perPlayer: room.playerTaskProgress
  };
}

function canEditSharedCode(room, socketId) {
  if (!room || room.state !== 'playing') return false;
  if (room.eliminatedPlayers.some((p) => p.id === socketId)) return false;
  return room.players.some((p) => p.id === socketId);
}

function initializeGame(room) {
  const scenario = getScenario(room.scenario);
  const plan = scenario.roomPlanBuilder(room.players.length);

  room.sharedCode = scenario.sharedCodeTemplate;
  room.sharedCodeVersion = 0;
  room.eliminatedPlayers = [];
  room.votes = {};
  room.taskStatus = {};
  room.playerTaskQueues = {};
  room.playerCurrentTask = {};
  room.taskOwners = {};
  room.playerTaskProgress = {};
  room.taskTestResults = {};

  const spyIndex = Math.floor(Math.random() * room.players.length);
  room.spyId = room.players[spyIndex].id;

  const coders = room.players.filter((player) => player.id !== room.spyId);
  const spy = room.players.find((player) => player.id === room.spyId);

  coders.forEach((player, index) => {
    room.roles[player.id] = 'coder';
    room.playerTaskQueues[player.id] = [...(plan.coderQueues[index] || [])];
    room.playerCurrentTask[player.id] = room.playerTaskQueues[player.id][0] || null;
    room.playerTaskProgress[player.id] = {
      done: 0,
      total: room.playerTaskQueues[player.id].length
    };
  });

  if (spy) {
    room.roles[spy.id] = 'spy';
    room.playerTaskQueues[spy.id] = [...(plan.spyQueue || [])];
    room.playerCurrentTask[spy.id] = room.playerTaskQueues[spy.id][0] || null;
    room.playerTaskProgress[spy.id] = {
      done: 0,
      total: room.playerTaskQueues[spy.id].length
    };
  }

  room.players.forEach((player) => {
    const currentTaskId = room.playerCurrentTask[player.id];
    if (currentTaskId) {
      room.taskOwners[currentTaskId] = player.id;
      room.taskStatus[currentTaskId] = 'active';
      room.taskCards[player.id] = buildTaskCard(
        scenario,
        currentTaskId,
        room.roles[player.id]
      );
    }
    room.emergencyCalls[player.id] = 0;
  });

  room.state = 'playing';
  room.gameEndTime = Date.now() + room.timerMinutes * 60 * 1000;
}

function getCurrentTask(room, playerId) {
  return room.playerCurrentTask[playerId] || null;
}

function advancePlayerTask(room, playerId) {
  const queue = room.playerTaskQueues[playerId] || [];
  if (queue.length === 0) {
    room.playerCurrentTask[playerId] = null;
    room.taskCards[playerId] = null;
    return null;
  }

  queue.shift();

  const nextTaskId = queue[0] || null;
  room.playerCurrentTask[playerId] = nextTaskId;

  if (nextTaskId) {
    room.taskStatus[nextTaskId] = 'active';
    room.taskOwners[nextTaskId] = playerId;
    const scenario = getScenario(room.scenario);
    room.taskCards[playerId] = buildTaskCard(
      scenario,
      nextTaskId,
      room.roles[playerId]
    );
  } else {
    room.taskCards[playerId] = null;
  }

  return nextTaskId;
}

async function runTaskTestsForPlayer(room, playerId) {
  const scenario = getScenario(room.scenario);
  const taskId = getCurrentTask(room, playerId);
  if (!taskId) {
    return {
      taskId: null,
      compileError: null,
      results: [],
      passed: 0,
      failed: 0,
      taskCompleted: false
    };
  }

  const task = scenario.tasks[taskId];
  const allTestIds = [
    ...(task.visibleTests || []).map((test) => test.id),
    ...(task.hiddenTests || []).map((test) => test.id)
  ];

  const result = await runJavaTests(room.sharedCode, allTestIds);
  const taskCompleted = !result.compileError && result.failed === 0;

  room.taskTestResults[taskId] = result;

  if (taskCompleted) {
    room.taskStatus[taskId] = 'passed';
    room.playerTaskProgress[playerId].done += 1;
    advancePlayerTask(room, playerId);
  }

  return {
    taskId,
    compileError: result.compileError,
    results: result.results,
    passed: result.passed,
    failed: result.failed,
    taskCompleted
  };
}

async function runFinalSuite(room) {
  const scenario = getScenario(room.scenario);
  const testIds = scenario.finalSuite.map((test) => test.id);
  const result = await runJavaTests(room.sharedCode, testIds);

  room.finalTestResults = {
    total: testIds.length,
    passed: result.passed,
    failed: result.failed,
    compileError: result.compileError,
    tests: result.results.map((item) => {
      const meta = scenario.finalSuite.find((test) => test.id === item.id);
      return {
        id: item.id,
        desc: meta?.desc || item.id,
        status: item.status,
        message: item.message || ''
      };
    })
  };

  return room.finalTestResults;
}

async function endGame(room, roomCode, io, winner, message) {
  if (room.gameTimeout) {
    clearTimeout(room.gameTimeout);
    room.gameTimeout = null;
  }

  room.state = 'ended';

  const spyPlayer =
    room.players.find((p) => p.id === room.spyId) ||
    room.eliminatedPlayers.find((p) => p.id === room.spyId) ||
    { name: 'Unknown', id: room.spyId };

  const finalResults = await runFinalSuite(room);

  io.to(roomCode).emit('game_end', {
    winner,
    message,
    spyId: room.spyId,
    spyName: spyPlayer.name,
    spyTask: room.taskCards[room.spyId] || null,
    finalCode: room.sharedCode,
    finalTestResults: finalResults,
    players: room.players,
    eliminatedPlayers: room.eliminatedPlayers
  });
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
      chatMessages: room.chatMessages || []
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

    initializeGame(room);

    room.players.forEach((player) => {
      const playerSocket = io.sockets.sockets.get(player.id);
      if (!playerSocket) return;

      playerSocket.emit('game_started', {
        role: room.roles[player.id],
        taskCard: room.taskCards[player.id],
        scenario: {
          name: getScenario(room.scenario).name
        },
        players: room.players,
        eliminatedPlayers: room.eliminatedPlayers,
        sharedCode: room.sharedCode,
        sharedCodeVersion: room.sharedCodeVersion,
        progress: buildProgressPayload(room),
        gameEndTime: room.gameEndTime,
        isSpy: player.id === room.spyId,
        roomCode,
        playerName: player.name,
        chatMessages: room.chatMessages || []
      });
    });

    if (room.gameTimeout) clearTimeout(room.gameTimeout);

    room.gameTimeout = setTimeout(async () => {
      const currentRoom = getRoom(roomCode);
      if (currentRoom && currentRoom.state === 'playing') {
        await endGame(currentRoom, roomCode, io, 'spy', 'Time ran out! The Spy survives — Spy wins!');
      }
    }, room.timerMinutes * 60 * 1000);
  });

  socket.on('shared_code_update', ({ roomCode, content, version }) => {
    const room = getRoom(roomCode);
    if (!room || room.state !== 'playing') return;

    if (!canEditSharedCode(room, socket.id)) {
      return socket.emit('edit_rejected', { message: 'You cannot edit the shared code.' });
    }

    const serverVersion = room.sharedCodeVersion || 0;
    if (version !== undefined && version < serverVersion - 2) {
      return socket.emit('shared_code_resync', {
        content: room.sharedCode,
        version: serverVersion
      });
    }

    room.sharedCodeVersion = serverVersion + 1;
    room.sharedCode = content;

    socket.to(roomCode).emit('shared_code_updated', {
      editorId: socket.id,
      content,
      version: room.sharedCodeVersion
    });
  });

  socket.on('run_task_tests', async ({ roomCode }) => {
    const room = getRoom(roomCode);
    if (!room || room.state !== 'playing') return;

    const currentTaskId = getCurrentTask(room, socket.id);
    if (!currentTaskId) {
      return socket.emit('task_test_result', {
        taskId: null,
        compileError: null,
        results: [],
        passed: 0,
        failed: 0,
        taskCompleted: false,
        progress: buildProgressPayload(room),
        nextTaskCard: null
      });
    }

    const result = await runTaskTestsForPlayer(room, socket.id);

    socket.emit('task_test_result', {
      ...result,
      progress: buildProgressPayload(room),
      nextTaskCard: room.taskCards[socket.id] || null
    });

    io.to(roomCode).emit('progress_updated', {
      progress: buildProgressPayload(room),
      sharedCodeVersion: room.sharedCodeVersion
    });

    const everyoneFinished = room.players.every((player) => {
      return !room.playerCurrentTask[player.id];
    });

    if (everyoneFinished) {
      await endGame(room, roomCode, io, 'coders', 'All assigned tasks were completed!');
    }
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

    room.emergencyCalls[socket.id] = 1;
    room.state = 'voting';
    room.votes = {};
    room.votingInitiator = socket.id;
    room.discussionEndTime = Date.now() + 10 * 1000;

    const caller = room.players.find((p) => p.id === socket.id);
    io.to(roomCode).emit('freeze_editor', {
      calledBy: caller?.name || 'Someone',
      discussionEndTime: room.discussionEndTime
    });
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

    if (totalVotes === totalPlayers) {
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
  });

  socket.on('disconnect', () => {
    console.log(`disconnected: ${socket.id}`);

    for (const [code, room] of rooms) {
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
        if (room.players.length === 0) removeRoom(code);
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
        break;
      }

      if (isSpy && isActiveGame) {
        io.to(code).emit('spy_left', {
          spyName: leavingPlayer?.name || 'The Spy',
          finalCode: room.sharedCode,
          players: room.players,
          eliminatedPlayers: room.eliminatedPlayers
        });

        room.state = 'ended';
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

      if (room.players.length === 0) {
        removeRoom(code);
      }
      break;
    }
  });
}

function resolveVote(room, roomCode, io) {
  const voteCounts = {};
  room.players.forEach((p) => {
    voteCounts[p.id] = 0;
  });
  voteCounts.skip = 0;

  Object.values(room.votes).forEach((vote) => {
    if (voteCounts[vote] !== undefined) voteCounts[vote] += 1;
    else voteCounts.skip += 1;
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

  if (!ejected) {
    room.state = 'playing';
    io.to(roomCode).emit('vote_result', {
      ejected: null,
      ejectedId: null,
      wasTheSpy: false,
      players: room.players,
      eliminatedPlayers: room.eliminatedPlayers
    });
    return;
  }

  const ejectedPlayer = room.players.find((p) => p.id === ejected);
  const wasTheSpy = ejected === room.spyId;

  if (ejectedPlayer) {
    room.eliminatedPlayers.push({ id: ejectedPlayer.id, name: ejectedPlayer.name });
  }

  room.players = room.players.filter((p) => p.id !== ejected);

  const remainingPlayers = room.players;
  const spyStillAlive = remainingPlayers.some((p) => p.id === room.spyId);

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

module.exports = {
  handleConnection,
  endGame
};