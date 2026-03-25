import React, { useState, useEffect } from 'react';
import socket from '../utils/socket';

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 6;

export default function LobbyScreen({ onGameStart }) {
  const [phase, setPhase] = useState('home');
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [roomData, setRoomData] = useState(null);
  const [settings, setSettings] = useState({ scenario: 'bank', timerMinutes: 8 });

  useEffect(() => {
    socket.connect();

    const onRoomCreated = (data) => {
      setRoomData({ ...data, isHost: true });
      setSettings({
        scenario: data.scenario || 'bank',
        timerMinutes: data.timerMinutes || 8
      });
      setPhase('waiting');
    };

    const onJoinedRoom = (data) => {
      setRoomData({ ...data, isHost: false });
      setSettings({
        scenario: data.scenario || 'bank',
        timerMinutes: data.timerMinutes || 8
      });
      setPhase('waiting');
    };

    const onPlayerJoined = ({ players, minPlayers, maxPlayers }) => {
      setRoomData(prev => prev ? { ...prev, players, minPlayers, maxPlayers } : prev);
    };

    const onPlayerLeft = ({ players, minPlayers, maxPlayers }) => {
      setRoomData(prev => prev ? { ...prev, players, minPlayers, maxPlayers } : prev);
    };

    const onSettingsUpdated = (s) => {
      setSettings({ scenario: s.scenario, timerMinutes: s.timerMinutes });
    };

    const onGameStarted = (data) => {
      onGameStart({ ...data, roomCode: roomData?.roomCode, playerName });
    };

    const onError = ({ message }) => setError(message);

    socket.on('room_created', onRoomCreated);
    socket.on('joined_room', onJoinedRoom);
    socket.on('player_joined', onPlayerJoined);
    socket.on('player_left', onPlayerLeft);
    socket.on('settings_updated', onSettingsUpdated);
    socket.on('game_started', onGameStarted);
    socket.on('error', onError);

    return () => {
      socket.off('room_created', onRoomCreated);
      socket.off('joined_room', onJoinedRoom);
      socket.off('player_joined', onPlayerJoined);
      socket.off('player_left', onPlayerLeft);
      socket.off('settings_updated', onSettingsUpdated);
      socket.off('game_started', onGameStarted);
      socket.off('error', onError);
    };
  }, [roomData?.roomCode, playerName, onGameStart]);

  function handleCreate() {
    if (!playerName.trim()) return setError('Enter your name first.');
    setError('');
    socket.emit('create_room', { playerName: playerName.trim() });
  }

  function handleJoin() {
    if (!playerName.trim()) return setError('Enter your name first.');
    if (!roomCode.trim()) return setError('Enter a room code.');
    setError('');
    socket.emit('join_room', {
      roomCode: roomCode.trim().toUpperCase(),
      playerName: playerName.trim()
    });
  }

  function handleSettingChange(key, value) {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    socket.emit('update_settings', { roomCode: roomData.roomCode, ...updated });
  }

  function handleStartGame() {
    socket.emit('start_game', { roomCode: roomData.roomCode });
  }

  const inputClass = 'w-full bg-gray-900 border border-green-800 text-green-300 font-mono px-4 py-3 rounded focus:outline-none focus:border-green-400 placeholder-gray-600';
  const btnPrimary = 'w-full bg-green-600 hover:bg-green-500 text-black font-bold font-mono py-3 rounded transition-colors';
  const btnSecondary = 'w-full bg-transparent border border-green-700 hover:border-green-400 text-green-400 font-mono py-3 rounded transition-colors';

  if (phase === 'home') return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="mb-10 text-center">
        <h1 className="text-5xl font-display text-green-400 tracking-widest mb-2">CODE SPY</h1>
        <p className="text-gray-500 font-mono text-sm">multiplayer social deduction · live code editor</p>
      </div>

      <div className="w-full max-w-sm space-y-4">
        <input
          className={inputClass}
          placeholder="your codename..."
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setPhase('create')}
          maxLength={10}
        />
        {error && <p className="text-red-400 font-mono text-sm text-center">{error}</p>}
        <button className={btnPrimary} onClick={() => {
          if (!playerName.trim()) return setError('Enter your name first.');
          setError('');
          setPhase('create');
        }}>
          ▶ CREATE ROOM
        </button>
        <button className={btnSecondary} onClick={() => {
          if (!playerName.trim()) return setError('Enter your name first.');
          setError('');
          setPhase('join');
        }}>
          ⌨ JOIN ROOM
        </button>
      </div>

      <div className="mt-16 text-gray-700 font-mono text-xs text-center space-y-1">
        <p>4–6 players · live code editor</p>
        <p>think among us, but the murder weapon is a null pointer exception</p>
      </div>
    </div>
  );

  if (phase === 'create') return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h2 className="text-green-400 font-display text-2xl tracking-widest mb-6">CREATE ROOM</h2>
        <p className="text-gray-400 font-mono text-sm">Playing as: <span className="text-green-300">{playerName}</span></p>
        {error && <p className="text-red-400 font-mono text-sm">{error}</p>}
        <button className={btnPrimary} onClick={handleCreate}>⚡ GENERATE ROOM CODE</button>
        <button className={btnSecondary} onClick={() => { setError(''); setPhase('home'); }}>← BACK</button>
      </div>
    </div>
  );

  if (phase === 'join') return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4">
        <h2 className="text-green-400 font-display text-2xl tracking-widest mb-6">JOIN ROOM</h2>
        <p className="text-gray-400 font-mono text-sm">Playing as: <span className="text-green-300">{playerName}</span></p>
        <input
          className={inputClass}
          placeholder="SPY-XX00"
          value={roomCode}
          onChange={e => setRoomCode(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
          maxLength={8}
        />
        {error && <p className="text-red-400 font-mono text-sm">{error}</p>}
        <button className={btnPrimary} onClick={handleJoin}>→ JOIN GAME</button>
        <button className={btnSecondary} onClick={() => { setError(''); setPhase('home'); }}>← BACK</button>
      </div>
    </div>
  );

  if (phase === 'waiting' && roomData) {
    const { isHost, players, scenarios } = roomData;
    const minPlayers = roomData.minPlayers || MIN_PLAYERS;
    const maxPlayers = roomData.maxPlayers || MAX_PLAYERS;
    const canStart = players.length >= minPlayers;
    const remainingSlots = Math.max(0, maxPlayers - players.length);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <div className="border border-green-800 rounded-lg p-6 mb-6 text-center bg-gray-950">
            <p className="text-gray-500 font-mono text-xs mb-1 tracking-widest">ROOM CODE</p>
            <p className="text-green-400 font-display text-4xl tracking-widest">{roomData.roomCode}</p>
            <p className="text-gray-600 font-mono text-xs mt-2">share this with your friends</p>
          </div>

          <div className="border border-gray-800 rounded-lg p-4 mb-6 bg-gray-950">
            <div className="flex items-center justify-between mb-3">
              <p className="text-gray-500 font-mono text-xs tracking-widest">
                PLAYERS ({players.length}/{maxPlayers})
              </p>
              <p className="text-gray-600 font-mono text-xs">
                min {minPlayers} to start
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {players.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border border-gray-800 rounded px-3 py-2 bg-gray-900">
                  <span className="text-green-500 text-xs">▶</span>
                  <span className="text-green-300 font-mono truncate">{p.name}</span>
                  {p.id === roomData.players[0]?.id && (
                    <span className="text-yellow-600 font-mono text-xs ml-auto">HOST</span>
                  )}
                </div>
              ))}

              {Array.from({ length: remainingSlots }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 border border-dashed border-gray-800 rounded px-3 py-2 bg-gray-950">
                  <span className="text-gray-700 text-xs">·</span>
                  <span className="text-gray-700 font-mono text-sm">waiting for player...</span>
                </div>
              ))}
            </div>
          </div>

          {isHost && (
            <div className="border border-gray-800 rounded-lg p-4 mb-6 bg-gray-950">
              <p className="text-gray-500 font-mono text-xs tracking-widest mb-4">GAME SETTINGS</p>
              <div className="space-y-4">
                <div>
                  <label className="text-gray-400 font-mono text-xs mb-1 block">SCENARIO</label>
                  <select
                    className="w-full bg-gray-900 border border-green-900 text-green-300 font-mono px-3 py-2 rounded focus:outline-none focus:border-green-500"
                    value={settings.scenario}
                    onChange={e => handleSettingChange('scenario', e.target.value)}
                  >
                    {(scenarios || []).map(s => (
                      <option key={s.key} value={s.key}>{s.name} — {s.language}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-gray-400 font-mono text-xs mb-1 block">ROUND TIMER</label>
                  <div className="flex gap-2">
                    {[5, 8, 10].map(t => (
                      <button
                        key={t}
                        onClick={() => handleSettingChange('timerMinutes', t)}
                        className={`flex-1 py-2 rounded font-mono text-sm border transition-colors ${
                          settings.timerMinutes === t
                            ? 'border-green-400 text-green-400 bg-green-950'
                            : 'border-gray-700 text-gray-500 hover:border-gray-500'
                        }`}
                      >
                        {t}m
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!isHost && (
            <div className="border border-gray-800 rounded-lg p-4 mb-6 bg-gray-950 text-center">
              <p className="text-gray-600 font-mono text-sm">waiting for host to start the game...</p>
              <p className="text-gray-700 font-mono text-xs mt-1">
                scenario: <span className="text-gray-500">{settings.scenario}</span> · timer: <span className="text-gray-500">{settings.timerMinutes}m</span>
              </p>
            </div>
          )}

          {error && <p className="text-red-400 font-mono text-sm text-center mb-3">{error}</p>}

          {isHost && (
            <button
              className={`${canStart ? btnPrimary : 'w-full py-3 rounded font-mono font-bold bg-gray-800 text-gray-600 cursor-not-allowed'}`}
              onClick={canStart ? handleStartGame : undefined}
            >
              {canStart
                ? `🚀 START GAME (${players.length}/${maxPlayers})`
                : `waiting for players (${players.length}/${minPlayers} min)`}
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}