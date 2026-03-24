const rooms = new Map();

function createRoom(roomCode, hostId, hostName) {
  const room = {
    code: roomCode,
    hostId,
    players: [{ id: hostId, name: hostName, ready: false }],
    state: 'lobby',      // lobby | playing | voting | ended
    language: 'java',
    scenario: 'bank',
    timerMinutes: 8,
    spyId: null,
    roles: {},           // socketId -> 'coder' | 'spy'
    taskCards: {},       // socketId -> task card text
    editorContent: {},   // regionKey -> code string
    votes: {},           // socketId -> votedFor socketId
    emergencyCalls: {},  // socketId -> how many used
    votingInitiator: null,
    discussionEndTime: null,
    gameEndTime: null,
  };
  rooms.set(roomCode, room);
  return room;
}

function getRoom(roomCode) {
  return rooms.get(roomCode);
}

function removeRoom(roomCode) {
  rooms.delete(roomCode);
}

module.exports = { createRoom, getRoom, removeRoom, rooms };