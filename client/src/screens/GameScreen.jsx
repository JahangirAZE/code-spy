import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import debounce from 'lodash/debounce';
import socket from '../utils/socket';
import NotificationFeed from './NotificationFeed';
import RegionEditor from './RegionEditor';

export default function GameScreen({ gameData, onGameEnd }) {
  const {
    taskCard,
    skeleton,
    scenario,
    players,
    editorContent: initialContent,
    gameEndTime,
    isSpy,
    roomCode,
    playerName,
    eliminatedPlayers: initialEliminated = []
  } = gameData;

  const [editorContent, setEditorContent] = useState(initialContent || {});
  const [editorVersions, setEditorVersions] = useState({});
  const [timeLeft, setTimeLeft] = useState('');
  const [frozen, setFrozen] = useState(false);
  const [discussionLeft, setDiscussionLeft] = useState(null);
  const [votingPhase, setVotingPhase] = useState(false);
  const [votes, setVotes] = useState({ in: 0, total: players.length });
  const [myVote, setMyVote] = useState(null);
  const [emergencyUsed, setEmergencyUsed] = useState(false);
  const [activePlayers, setActivePlayers] = useState(players || []);
  const [eliminatedPlayers, setEliminatedPlayers] = useState(initialEliminated);
  const [typingPlayers, setTypingPlayers] = useState({});
  const [notifications, setNotifications] = useState([]);

  const typingTimeoutsRef = useRef({});
  const notificationTimersRef = useRef({});
  const oneMinuteNotifiedRef = useRef(false);
  const mySocketId = useRef(socket.id);
  const editorVersionsRef = useRef({});

  const amEliminated = eliminatedPlayers.some((p) => p.id === mySocketId.current);

  const language = skeleton?.includes('public class') ? 'java' : skeleton?.includes('def ') ? 'python' : 'csharp';

  useEffect(() => {
    editorVersionsRef.current = editorVersions;
  }, [editorVersions]);

  const debouncedEmit = useMemo(
    () =>
      debounce((roomCodeParam, targetPlayerId, content, version) => {
        socket.emit('region_update', { roomCode: roomCodeParam, targetPlayerId, content, version });
      }, 80),
    []
  );

  const addOrUpdateNotification = useCallback((item) => {
    setNotifications((prev) => {
      const exists = prev.find((n) => n.id === item.id);
      if (exists) {
        return prev.map((n) => (n.id === item.id ? { ...n, ...item } : n));
      }
      return [item, ...prev].slice(0, 30);
    });
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const pushTimedNotification = useCallback(
    (item, duration = 3000) => {
      addOrUpdateNotification(item);
      if (notificationTimersRef.current[item.id]) {
        clearTimeout(notificationTimersRef.current[item.id]);
      }
      notificationTimersRef.current[item.id] = setTimeout(() => {
        removeNotification(item.id);
        delete notificationTimersRef.current[item.id];
      }, duration);
    },
    [addOrUpdateNotification, removeNotification]
  );

  const pushPersistentNotification = useCallback(
    (item) => {
      addOrUpdateNotification(item);
    },
    [addOrUpdateNotification]
  );

  const markPlayerTyping = useCallback(
    (playerId, name) => {
      const isElim = eliminatedPlayers.some((p) => p.id === playerId);
      if (isElim) return;

      setTypingPlayers((prev) => ({ ...prev, [playerId]: true }));
      addOrUpdateNotification({
        id: `typing-${playerId}`,
        type: 'typing',
        message: `✍ ${name} is typing...`,
        createdAt: Date.now()
      });

      if (typingTimeoutsRef.current[playerId]) {
        clearTimeout(typingTimeoutsRef.current[playerId]);
      }
      if (notificationTimersRef.current[`typing-${playerId}`]) {
        clearTimeout(notificationTimersRef.current[`typing-${playerId}`]);
      }

      typingTimeoutsRef.current[playerId] = setTimeout(() => {
        setTypingPlayers((prev) => {
          const next = { ...prev };
          delete next[playerId];
          return next;
        });
        removeNotification(`typing-${playerId}`);
        delete typingTimeoutsRef.current[playerId];
      }, 1500);
    },
    [addOrUpdateNotification, removeNotification, eliminatedPlayers]
  );

  useEffect(() => {
    const tick = setInterval(() => {
      const remaining = Math.max(0, gameEndTime - Date.now());
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      if (remaining === 0) clearInterval(tick);
    }, 500);
    return () => clearInterval(tick);
  }, [gameEndTime]);

  useEffect(() => {
    const tick = setInterval(() => {
      const remaining = Math.max(0, gameEndTime - Date.now());
      if (remaining <= 60000 && !oneMinuteNotifiedRef.current) {
        oneMinuteNotifiedRef.current = true;
        pushPersistentNotification({
          id: 'timer-1-minute',
          type: 'timer',
          message: '⏱ 1 minute left',
          createdAt: Date.now()
        });
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [gameEndTime, pushPersistentNotification]);

  useEffect(() => {
    if (!frozen || discussionLeft === null) return;
    addOrUpdateNotification({
      id: 'discussion-countdown',
      type: 'timer',
      message: `🗳 Voting starts in ${discussionLeft}s`,
      createdAt: Date.now()
    });

    const tick = setInterval(() => {
      setDiscussionLeft((prev) => {
        if (prev <= 1) {
          clearInterval(tick);
          setVotingPhase(true);
          addOrUpdateNotification({
            id: 'voting-started',
            type: 'system',
            message: '🗳 Voting has started',
            createdAt: Date.now()
          });
          removeNotification('discussion-countdown');
          return 0;
        }
        const next = prev - 1;
        addOrUpdateNotification({
          id: 'discussion-countdown',
          type: 'timer',
          message: `🗳 Voting starts in ${next}s`,
          createdAt: Date.now()
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [frozen, discussionLeft, addOrUpdateNotification, removeNotification]);

  useEffect(() => {
    const handleCodeUpdate = ({ playerId, content }) => {
      const isElim = eliminatedPlayers.some((p) => p.id === playerId);
      if (isElim) return;

      setEditorContent((prev) => ({ ...prev, [playerId]: content }));
      const player = activePlayers.find((p) => p.id === playerId);
      if (player) markPlayerTyping(playerId, player.name);
    };

    const handleFreezeEditor = ({ calledBy, discussionEndTime }) => {
      setFrozen(true);
      setDiscussionLeft(Math.ceil((discussionEndTime - Date.now()) / 1000));
      setVotingPhase(false);
      setMyVote(null);
      pushPersistentNotification({
        id: `emergency-${Date.now()}`,
        type: 'emergency',
        message: `🚨 Emergency call by ${calledBy}`,
        createdAt: Date.now()
      });
    };

    const handleVoteUpdate = ({ votesIn, totalPlayers }) => {
      setVotes({ in: votesIn, total: totalPlayers });
    };

    const handleVoteResult = ({ ejected, ejectedId, wasTheSpy, players: updatedPlayers, eliminatedPlayers: updatedEliminated }) => {
      if (updatedEliminated) setEliminatedPlayers(updatedEliminated);

      setActivePlayers(updatedPlayers);
      setFrozen(false);
      setVotingPhase(false);
      setDiscussionLeft(null);
      removeNotification('discussion-countdown');
      removeNotification('voting-started');
      pushPersistentNotification({
        id: `vote-${Date.now()}`,
        type: 'system',
        message: ejected
          ? `⚖️ ${ejected} was ejected${wasTheSpy ? ' and was the Spy.' : '.'}`
          : '⚖️ No one was ejected. Game resumes.',
        createdAt: Date.now()
      });

      if (ejectedId && ejectedId === mySocketId.current) {
        pushPersistentNotification({
          id: 'you-eliminated',
          type: 'warning',
          message: '💀 You were eliminated!',
          createdAt: Date.now()
        });
      }
    };

    const handlePlayerLeft = ({ players: updatedPlayers, leftId }) => {
      const leftPlayer = activePlayers.find((p) => p.id === leftId);
      setActivePlayers(updatedPlayers);
      if (leftId) {
        setTypingPlayers((prev) => {
          const next = { ...prev };
          delete next[leftId];
          return next;
        });
        removeNotification(`typing-${leftId}`);
        if (typingTimeoutsRef.current[leftId]) {
          clearTimeout(typingTimeoutsRef.current[leftId]);
          delete typingTimeoutsRef.current[leftId];
        }
      }
      if (leftPlayer) {
        pushTimedNotification({
          id: `left-${leftId}-${Date.now()}`,
          type: 'system',
          message: `👋 ${leftPlayer.name} left the room`,
          createdAt: Date.now()
        }, 5000);
      }
    };

    const handleGameEnd = (data) => {
      onGameEnd(data);
    };

    const handleRegionUpdated = ({ editorId, targetPlayerId, content, version }) => {
      if (editorId === mySocketId.current) return;
      if (targetPlayerId === mySocketId.current) return;

      const isElim = eliminatedPlayers.some((p) => p.id === editorId);
      if (isElim) return;

      setEditorContent((prev) => ({ ...prev, [targetPlayerId]: content }));
      setEditorVersions((prev) => ({ ...prev, [targetPlayerId]: version }));
      editorVersionsRef.current[targetPlayerId] = version;
      const editorPlayer = activePlayers.find((p) => p.id === editorId);
      if (editorPlayer) markPlayerTyping(editorId, editorPlayer.name);
    };

    const handleRegionResync = ({ targetPlayerId, content, version }) => {
      setEditorContent((prev) => ({ ...prev, [targetPlayerId]: content }));
      setEditorVersions((prev) => ({ ...prev, [targetPlayerId]: version }));
    };

    const handleEditRejected = ({ message }) => {
      pushTimedNotification({
        id: `reject-${Date.now()}`,
        type: 'warning',
        message: `🔒 ${message}`,
        createdAt: Date.now()
      }, 2500);
    };

    socket.on('code_update', handleCodeUpdate);
    socket.on('freeze_editor', handleFreezeEditor);
    socket.on('vote_update', handleVoteUpdate);
    socket.on('vote_result', handleVoteResult);
    socket.on('player_left', handlePlayerLeft);
    socket.on('game_end', handleGameEnd);
    socket.on('region_updated', handleRegionUpdated);
    socket.on('region_resync', handleRegionResync);
    socket.on('edit_rejected', handleEditRejected);

    const typingTimeouts = typingTimeoutsRef.current;
    const notificationTimers = notificationTimersRef.current;

    return () => {
      socket.off('code_update', handleCodeUpdate);
      socket.off('freeze_editor', handleFreezeEditor);
      socket.off('vote_update', handleVoteUpdate);
      socket.off('vote_result', handleVoteResult);
      socket.off('player_left', handlePlayerLeft);
      socket.off('game_end', handleGameEnd);
      socket.off('region_updated', handleRegionUpdated);
      socket.off('region_resync', handleRegionResync);
      socket.off('edit_rejected', handleEditRejected);
      Object.values(typingTimeouts).forEach(clearTimeout);
      Object.values(notificationTimers).forEach(clearTimeout);
      debouncedEmit.cancel();
    };
  }, [
    activePlayers,
    eliminatedPlayers,
    onGameEnd,
    markPlayerTyping,
    pushTimedNotification,
    pushPersistentNotification,
    removeNotification,
    debouncedEmit
  ]);

  function handleRegionChange(targetPlayerId, value = '') {
    if (amEliminated) return;
    if (frozen) return;

    const canEdit = targetPlayerId === mySocketId.current;
    if (!canEdit) {
      pushTimedNotification({
        id: `forbidden-${Date.now()}`,
        type: 'warning',
        message: '🔒 You cannot edit this region',
        createdAt: Date.now()
      }, 2000);
      return;
    }

    setEditorContent((prev) => ({ ...prev, [targetPlayerId]: value }));
    markPlayerTyping(mySocketId.current, playerName);

    const currentVersion = editorVersionsRef.current[targetPlayerId] || 0;
    editorVersionsRef.current[targetPlayerId] = currentVersion + 1;
    setEditorVersions((prev) => ({ ...prev, [targetPlayerId]: currentVersion + 1 }));
    debouncedEmit(roomCode, targetPlayerId, value, currentVersion);
  }

  function handleEmergency() {
    if (amEliminated || emergencyUsed || frozen) return;
    setEmergencyUsed(true);
    socket.emit('emergency_call', { roomCode });
  }

  function castVote(targetId) {
    if (amEliminated || myVote) return;
    setMyVote(targetId);
    socket.emit('cast_vote', { roomCode, votedFor: targetId });
  }

  const [mins = '00'] = timeLeft.split(':');
  const parsedMins = parseInt(mins, 10);
  const timerColor =
    parsedMins <= 1
      ? 'text-red-400 blink'
      : parsedMins <= 3
      ? 'text-yellow-400'
      : 'text-green-400';

  const allPlayersForSidebar = [
    ...activePlayers,
    ...eliminatedPlayers.map((p) => ({ ...p, eliminated: true }))
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gray-950" style={{ height: '100vh' }}>
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-950 flex-shrink-0">
        <span className="text-green-500 font-display tracking-widest text-lg">CODE SPY</span>
        <div className="flex items-center gap-4">
          <span className="text-gray-600 font-mono text-xs">{roomCode}</span>
          <span className={`font-display text-2xl ${timerColor}`}>⏱ {timeLeft}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* ← NEW: eliminated banner in header */}
          {amEliminated && (
            <span className="font-mono text-xs px-2 py-1 rounded bg-gray-800 text-gray-500 border border-gray-700">
              💀 ELIMINATED
            </span>
          )}
          <span
            className={`font-mono text-xs px-2 py-1 rounded ${
              isSpy
                ? 'bg-red-950 text-red-400 border border-red-800'
                : 'bg-green-950 text-green-400 border border-green-800'
            }`}
          >
            {isSpy ? '🔴 SPY' : '🟢 CODER'}
          </span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 border-r border-gray-800 bg-gray-950 flex flex-col flex-shrink-0">
          <div className="px-3 py-2 border-b border-gray-800">
            <p className="text-gray-600 font-mono text-xs tracking-widest">PLAYERS</p>
          </div>
          <div className="max-h-64 overflow-y-auto p-2 space-y-2">
            {/* ← NEW: render active + eliminated players together */}
            {allPlayersForSidebar.map((p) => {
              const isMe = p.id === mySocketId.current;
              const isTyping = !!typingPlayers[p.id];
              const isElim = !!p.eliminated;
              return (
                <div
                  key={p.id}
                  className={`rounded p-2 border ${
                    isElim
                      ? 'border-gray-800 bg-gray-900 opacity-50'
                      : isMe
                      ? 'border-green-800 bg-green-950'
                      : 'border-gray-800 bg-gray-900'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <span className={`text-xs ${isElim ? 'text-gray-600' : isMe ? 'text-green-400' : 'text-gray-400'}`}>
                      {isElim ? '💀' : isTyping ? '✍️' : '●'}
                    </span>
                    <span
                      className={`font-mono text-xs truncate ${
                        isElim
                          ? 'text-gray-600 line-through'
                          : isMe
                          ? 'text-green-300'
                          : 'text-gray-300'
                      }`}
                    >
                      {p.name}
                    </span>
                  </div>
                  {isMe && !isElim && <div className="text-green-700 font-mono text-xs mt-1">you</div>}
                  {/* ← NEW: show eliminated label to the eliminated player themselves */}
                  {isMe && isElim && (
                    <div className="text-gray-600 font-mono text-xs mt-1">you · eliminated</div>
                  )}
                  {isElim && !isMe && (
                    <div className="text-gray-700 font-mono text-xs mt-1">eliminated</div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex-1 min-h-0">
            <NotificationFeed items={notifications} />
          </div>
          <div className="p-2 border-t border-gray-800">
            <button
              onClick={handleEmergency}
              disabled={amEliminated || emergencyUsed || frozen}
              className={`w-full py-2 rounded font-mono text-xs font-bold transition-colors ${
                amEliminated || emergencyUsed || frozen
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-red-900 hover:bg-red-700 text-red-300 border border-red-800'
              }`}
            >
              {emergencyUsed ? '🚨 USED' : amEliminated ? '🚨 N/A' : '🚨 EMERGENCY'}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activePlayers.map((p) => {
            const editable = !frozen && !amEliminated && p.id === mySocketId.current;
            return (
              <RegionEditor
                key={p.id}
                title={`${p.name}'s region`}
                value={editorContent[p.id] || `// ===== ${p.name}'s region =====\n// Write your code here\n`}
                language={language}
                editable={editable}
                locked={!editable}
                onChange={(value) => handleRegionChange(p.id, value)}
              />
            );
          })}
        </div>

        <div className="w-56 border-l border-gray-800 bg-gray-950 flex flex-col flex-shrink-0">
          <div className="px-3 py-2 border-b border-gray-800">
            <p className="text-gray-600 font-mono text-xs tracking-widest">MY TASK</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {/* ← NEW: show eliminated overlay over task card */}
            {amEliminated ? (
              <div className="space-y-3">
                <div className="text-gray-600 font-mono text-xs font-bold">💀 ELIMINATED</div>
                <p className="text-gray-700 font-mono text-xs leading-relaxed">
                  You've been ejected from the game. Watch the remaining players and see how it ends.
                </p>
              </div>
            ) : isSpy ? (
              <div className="space-y-3">
                <div className="text-red-400 font-mono text-xs font-bold">🔴 MISSION — HACKER</div>
                <div>
                  <p className="text-gray-500 font-mono text-xs mb-1">METHOD</p>
                  <p className="text-red-300 font-mono text-xs">{taskCard?.method}</p>
                </div>
                <div>
                  <p className="text-gray-500 font-mono text-xs mb-1">SABOTAGE</p>
                  <p className="text-red-200 font-mono text-xs leading-relaxed">{taskCard?.sabotage}</p>
                </div>
                <div>
                  <p className="text-gray-500 font-mono text-xs mb-1">COVER</p>
                  <p className="text-orange-300 font-mono text-xs leading-relaxed">{taskCard?.cover}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-green-400 font-mono text-xs font-bold">🟢 TASK — CODER</div>
                <div>
                  <p className="text-gray-500 font-mono text-xs mb-1">METHOD</p>
                  <p className="text-green-300 font-mono text-xs">{taskCard?.method}</p>
                </div>
                <div>
                  <p className="text-gray-500 font-mono text-xs mb-1">RULES</p>
                  <ul className="space-y-1">
                    {(taskCard?.rules || []).map((r, i) => (
                      <li key={i} className="text-gray-300 font-mono text-xs leading-relaxed">· {r}</li>
                    ))}
                  </ul>
                </div>
                {taskCard?.hint && (
                  <div>
                    <p className="text-gray-500 font-mono text-xs mb-1">HINT</p>
                    <p className="text-yellow-600 font-mono text-xs leading-relaxed">{taskCard.hint}</p>
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-gray-600 font-mono text-xs tracking-widest mb-2">TEST CASES</p>
              {(scenario?.tests || []).map((t, i) => (
                <div key={i} className="text-gray-600 font-mono text-xs mb-1">◻ {t.desc}</div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {votingPhase && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-red-800 rounded-lg p-6 w-full max-w-sm">
            <h2 className="text-red-400 font-display text-xl tracking-widest mb-2 text-center">VOTE</h2>
            {/* ← NEW: eliminated players see a watch-only notice */}
            {amEliminated ? (
              <p className="text-gray-600 font-mono text-xs text-center py-4">
                💀 You are eliminated and cannot vote. Watching...
              </p>
            ) : (
              <>
                <p className="text-gray-500 font-mono text-xs text-center mb-4">
                  Who is the Spy? ({votes.in}/{votes.total} votes cast)
                </p>
                <div className="space-y-2 mb-4">
                  {activePlayers.map((p) => {
                    const isMe = p.id === mySocketId.current;
                    return (
                      <button
                        key={p.id}
                        onClick={() => !isMe && castVote(p.id)}
                        disabled={!!myVote || isMe}
                        className={`w-full py-3 rounded font-mono text-sm border transition-colors ${
                          myVote === p.id
                            ? 'border-red-500 bg-red-950 text-red-300'
                            : isMe
                            ? 'border-gray-800 text-gray-700 cursor-not-allowed'
                            : 'border-gray-700 text-gray-300 hover:border-red-600 hover:text-red-300'
                        }`}
                      >
                        {p.name} {isMe ? '(you)' : ''}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => castVote('skip')}
                    disabled={!!myVote}
                    className={`w-full py-3 rounded font-mono text-sm border transition-colors ${
                      myVote === 'skip'
                        ? 'border-blue-500 bg-blue-950 text-blue-300'
                        : 'border-gray-700 text-gray-500 hover:border-blue-600 hover:text-blue-300'
                    }`}
                  >
                    Skip (don't eject anyone)
                  </button>
                </div>
                {myVote && <p className="text-green-600 font-mono text-xs text-center">✓ Vote cast. Waiting for others...</p>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}