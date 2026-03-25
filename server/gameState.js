const rooms = new Map();

function createRoom(roomCode, hostId, hostName) {
  const room = {
    code: roomCode,
    hostId,
    state: 'lobby',
    players: [
      {
        id: hostId,
        name: hostName,
        ready: false
      }
    ],
    eliminatedPlayers: [],
    language: 'java',
    scenario: 'bank',
    timerMinutes: 8,

    roles: {},
    taskCards: {},

    emergencyCalls: {},
    votes: {},
    votingInitiator: null,
    discussionEndTime: null,

    spyId: null,
    gameEndTime: null,
    gameTimeout: null,

    minPlayers: 4,
    maxPlayers: 6,

    chatMessages: [],

    sharedCode: '',
    sharedCodeVersion: 0,

    playerTaskQueues: {},
    playerCurrentTask: {},
    taskStatus: {},
    taskOwners: {},
    playerTaskProgress: {},
    taskTestResults: {},
    finalTestResults: null
  };

  rooms.set(roomCode, room);
  return room;
}

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function removeRoom(roomCode) {
  const room = rooms.get(roomCode);
  if (room?.gameTimeout) {
    clearTimeout(room.gameTimeout);
  }
  rooms.delete(roomCode);
}

module.exports = {
  rooms,
  createRoom,
  getRoom,
  removeRoom
};