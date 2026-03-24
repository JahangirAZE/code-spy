room.editorVersions = {};
room.players.forEach(p => { room.editorVersions[p.id] = 0; });

socket.on('region_update', ({ roomCode, targetPlayerId, content, version }) => {
  const room = getRoom(roomCode);
  if (!room || room.state !== 'playing') return;

  if (!canEditRegion(room, socket.id, targetPlayerId)) {
    return socket.emit('edit_rejected', { targetPlayerId, message: 'You cannot edit this region.' });
  }

  const serverVersion = room.editorVersions[targetPlayerId] || 0;

  if (version !== undefined && version < serverVersion) {
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
    version: room.editorVersions[targetPlayerId],
  });
});
