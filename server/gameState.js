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
    
    language: 'java',
    scenario: 'bank',
    timerMinutes: 8,
    roles: {},
    taskCards: {},
    emergencyCalls: {},
    votes: {},
    editorContent: {},
    editorVersions: {},
    spyId: null,
    gameEndTime: null,
    minPlayers: 4,
    maxPlayers: 6,
    votingInitiator: null,
    discussionEndTime: null,
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