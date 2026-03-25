import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import debounce from 'lodash/debounce';
import socket from '../utils/socket';
import NotificationFeed from './NotificationFeed';
import RegionEditor from './RegionEditor';
import GameChat from './GameChat';
import useGameNotifications from '../utils/useGameNotifications';

export default function GameScreen({ gameData, onGameEnd }) {
  const {
    taskCard: initialTaskCard,
    scenario,
    players,
    sharedCode: initialSharedCode,
    sharedCodeVersion: initialSharedCodeVersion = 0,
    progress: initialProgress,
    gameEndTime,
    isSpy,
    roomCode,
    playerName,
    eliminatedPlayers: initialEliminated = [],
    chatMessages: initialChatMessages = []
  } = gameData;

  const [taskCard, setTaskCard] = useState(initialTaskCard || null);
  const [sharedCode, setSharedCode] = useState(initialSharedCode || '');
  const [sharedCodeVersion, setSharedCodeVersion] = useState(initialSharedCodeVersion);
  const [progress, setProgress] = useState(
    initialProgress || { completed: 0, total: 0, percent: 0, perPlayer: {} }
  );

  const [taskTestResult, setTaskTestResult] = useState(null);
  const [timeLeft, setTimeLeft] = useState('');
  const [frozen, setFrozen] = useState(false);
  const [discussionLeft, setDiscussionLeft] = useState(null);
  const [votingPhase, setVotingPhase] = useState(false);
  const [votes, setVotes] = useState({ in: 0, total: players.length });
  const [myVote, setMyVote] = useState(null);
  const [emergencyUsed, setEmergencyUsed] = useState(false);
  const [activePlayers, setActivePlayers] = useState(players || []);
  const [eliminatedPlayers, setEliminatedPlayers] = useState(initialEliminated);
  const [chatMessages, setChatMessages] = useState(initialChatMessages);
  const [chatInput, setChatInput] = useState('');
  const [isRunningTests, setIsRunningTests] = useState(false);

  const oneMinuteNotifiedRef = useRef(false);
  const mySocketId = useRef(socket.id);
  const sharedVersionRef = useRef(initialSharedCodeVersion);

  const {
    notifications,
    typingPlayers,
    addOrUpdateNotification,
    removeNotification,
    pushTimedNotification,
    pushPersistentNotification,
    markPlayerTyping,
    clearTypingState
  } = useGameNotifications(eliminatedPlayers);

  const amEliminated = eliminatedPlayers.some((p) => p.id === mySocketId.current);

  useEffect(() => {
    sharedVersionRef.current = sharedCodeVersion;
  }, [sharedCodeVersion]);

  const debouncedEmit = useMemo(
    () =>
      debounce((roomCodeParam, content, version) => {
        socket.emit('shared_code_update', {
          roomCode: roomCodeParam,
          content,
          version
        });
      }, 80),
    []
  );

  const handleSendChatMessage = useCallback(() => {
    const trimmedMessage = chatInput.trim();
    if (!trimmedMessage) return;

    socket.emit('chat_message', {
      roomCode,
      message: trimmedMessage.slice(0, 100)
    });

    setChatInput('');
  }, [chatInput, roomCode]);

  useEffect(() => {
    const tick = setInterval(() => {
      const remaining = Math.max(0, gameEndTime - Date.now());
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);

      setTimeLeft(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);

      if (remaining === 0) {
        clearInterval(tick);
      }
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

    const handleVoteResult = ({
      ejected,
      ejectedId,
      wasTheSpy,
      players: updatedPlayers,
      eliminatedPlayers: updatedEliminated
    }) => {
      if (updatedEliminated) {
        setEliminatedPlayers(updatedEliminated);
      }

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
      const leftPlayer = activePlayers.find((player) => player.id === leftId);
      setActivePlayers(updatedPlayers);

      if (leftId) {
        clearTypingState(leftId);
      }

      if (leftPlayer) {
        pushTimedNotification(
          {
            id: `left-${leftId}-${Date.now()}`,
            type: 'system',
            message: `👋 ${leftPlayer.name} left the room`,
            createdAt: Date.now()
          },
          5000
        );
      }
    };

    const handleGameEnd = (data) => {
      onGameEnd(data);
    };

    const handleSharedCodeUpdated = ({ editorId, content, version }) => {
      if (editorId === mySocketId.current) return;

      setSharedCode(content);
      setSharedCodeVersion(version);
      sharedVersionRef.current = version;

      const editorPlayer = activePlayers.find((player) => player.id === editorId);
      if (editorPlayer) {
        markPlayerTyping(editorId, editorPlayer.name);
      }
    };

    const handleSharedCodeResync = ({ content, version }) => {
      setSharedCode(content);
      setSharedCodeVersion(version);
      sharedVersionRef.current = version;
    };

    const handleEditRejected = ({ message }) => {
      pushTimedNotification(
        {
          id: `reject-${Date.now()}`,
          type: 'warning',
          message: `🔒 ${message}`,
          createdAt: Date.now()
        },
        2500
      );
    };

    const handleChatMessage = (chatItem) => {
      setChatMessages((prev) => [...prev, chatItem]);
    };

    const handleTaskTestResult = (payload) => {
      setIsRunningTests(false);
      setTaskTestResult(payload);
      setProgress(payload.progress);

      if (payload.nextTaskCard !== undefined) {
        setTaskCard(payload.nextTaskCard);
      }

      if (payload.taskCompleted) {
        pushPersistentNotification({
          id: `task-passed-${Date.now()}`,
          type: 'system',
          message: '✅ Task completed. New task unlocked.',
          createdAt: Date.now()
        });
      }
    };

    const handleProgressUpdated = ({ progress: nextProgress }) => {
      setProgress(nextProgress);
    };

    socket.on('freeze_editor', handleFreezeEditor);
    socket.on('vote_update', handleVoteUpdate);
    socket.on('vote_result', handleVoteResult);
    socket.on('player_left', handlePlayerLeft);
    socket.on('game_end', handleGameEnd);
    socket.on('shared_code_updated', handleSharedCodeUpdated);
    socket.on('shared_code_resync', handleSharedCodeResync);
    socket.on('edit_rejected', handleEditRejected);
    socket.on('chat_message', handleChatMessage);
    socket.on('task_test_result', handleTaskTestResult);
    socket.on('progress_updated', handleProgressUpdated);

    return () => {
      socket.off('freeze_editor', handleFreezeEditor);
      socket.off('vote_update', handleVoteUpdate);
      socket.off('vote_result', handleVoteResult);
      socket.off('player_left', handlePlayerLeft);
      socket.off('game_end', handleGameEnd);
      socket.off('shared_code_updated', handleSharedCodeUpdated);
      socket.off('shared_code_resync', handleSharedCodeResync);
      socket.off('edit_rejected', handleEditRejected);
      socket.off('chat_message', handleChatMessage);
      socket.off('task_test_result', handleTaskTestResult);
      socket.off('progress_updated', handleProgressUpdated);
      debouncedEmit.cancel();
    };
  }, [
    activePlayers,
    onGameEnd,
    markPlayerTyping,
    pushTimedNotification,
    pushPersistentNotification,
    removeNotification,
    addOrUpdateNotification,
    clearTypingState,
    debouncedEmit
  ]);

  function handleSharedCodeChange(value = '') {
    if (amEliminated) return;
    if (frozen) return;

    setSharedCode(value);
    markPlayerTyping(mySocketId.current, playerName);

    const currentVersion = sharedVersionRef.current || 0;
    const nextVersion = currentVersion + 1;

    sharedVersionRef.current = nextVersion;
    setSharedCodeVersion(nextVersion);

    debouncedEmit(roomCode, value, currentVersion);
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

  function runTests() {
    if (amEliminated || frozen || !taskCard || isRunningTests) return;
    setIsRunningTests(true);
    socket.emit('run_task_tests', { roomCode });
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
    ...eliminatedPlayers.map((player) => ({
      ...player,
      eliminated: true
    }))
  ];

  return (
    <div className="h-screen w-full overflow-hidden flex flex-col bg-gray-950">
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-950 flex-shrink-0">
        <span className="text-green-500 font-display tracking-widest text-lg">CODE SPY</span>

        <div className="flex items-center gap-4">
          <span className="text-gray-600 font-mono text-xs">{roomCode}</span>
          <span className={`font-display text-2xl ${timerColor}`}>⏱ {timeLeft}</span>
        </div>

        <div className="flex items-center gap-2">
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

      <div className="px-4 py-3 border-b border-gray-800 bg-gray-950 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <p className="text-gray-500 font-mono text-xs tracking-widest">TEAM PROGRESS</p>
          <p className="text-green-400 font-mono text-xs">
            {progress.completed}/{progress.total}
          </p>
        </div>
        <div className="h-2 rounded bg-gray-900 overflow-hidden border border-gray-800">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${progress.percent || 0}%` }}
          />
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="w-56 border-r border-gray-800 bg-gray-950 flex flex-col flex-shrink-0">
          <div className="px-3 py-2 border-b border-gray-800 flex-shrink-0">
            <p className="text-gray-600 font-mono text-xs tracking-widest">PLAYERS</p>
          </div>

          <div className="max-h-64 overflow-y-auto p-2 space-y-2 flex-shrink-0">
            {allPlayersForSidebar.map((p) => {
              const isMe = p.id === mySocketId.current;
              const isTyping = !!typingPlayers[p.id];
              const isElim = !!p.eliminated;
              const playerProgress = progress.perPlayer?.[p.id] || { done: 0, total: 0 };

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

                  <div className="text-gray-600 font-mono text-[10px] mt-1">
                    tasks {playerProgress.done}/{playerProgress.total}
                  </div>

                  {isMe && !isElim && <div className="text-green-700 font-mono text-xs mt-1">you</div>}
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

          <div className="flex-1 min-h-0 overflow-hidden">
            <NotificationFeed items={notifications} />
          </div>

          <div className="p-2 border-t border-gray-800 flex-shrink-0">
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

        <div className="flex-1 min-w-0 min-h-0 overflow-hidden p-4">
          <div className="h-full w-full">
            <RegionEditor
              title={`${scenario?.name || 'Scenario'} — shared live code`}
              value={sharedCode}
              language="java"
              editable={!frozen && !amEliminated}
              locked={frozen || amEliminated}
              onChange={handleSharedCodeChange}
            />
          </div>
        </div>

        <div className="w-80 border-l border-gray-800 bg-gray-950 flex flex-col flex-shrink-0">
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-3 py-2 border-b border-gray-800 flex-shrink-0">
              <p className="text-gray-600 font-mono text-xs tracking-widest">MY TASK</p>
            </div>

            <div className="overflow-y-auto p-3 min-h-0 space-y-4">
              {amEliminated ? (
                <div className="space-y-3">
                  <div className="text-gray-600 font-mono text-xs font-bold">💀 ELIMINATED</div>
                  <p className="text-gray-700 font-mono text-xs leading-relaxed">
                    You've been ejected from the game. Watch the remaining players and see how it ends.
                  </p>
                </div>
              ) : !taskCard ? (
                <div className="space-y-3">
                  <div className="text-green-400 font-mono text-xs font-bold">✅ ALL TASKS DONE</div>
                  <p className="text-gray-400 font-mono text-xs leading-relaxed">
                    You completed your task queue. Wait for the rest of the room or final results.
                  </p>
                </div>
              ) : isSpy ? (
                <div className="space-y-3">
                  <div className="text-red-400 font-mono text-xs font-bold">🔴 MISSION — SPY</div>
                  <div>
                    <p className="text-gray-500 font-mono text-xs mb-1">TASK</p>
                    <p className="text-red-300 font-mono text-xs">{taskCard?.title}</p>
                  </div>
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
                    <p className="text-gray-500 font-mono text-xs mb-1">TASK</p>
                    <p className="text-green-300 font-mono text-xs">{taskCard?.title}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 font-mono text-xs mb-1">METHOD</p>
                    <p className="text-green-300 font-mono text-xs">{taskCard?.method}</p>
                  </div>
                  <div>
                    <p className="text-gray-500 font-mono text-xs mb-1">RULES</p>
                    <ul className="space-y-1">
                      {(taskCard?.rules || []).map((rule, index) => (
                        <li key={index} className="text-gray-300 font-mono text-xs leading-relaxed">
                          · {rule}
                        </li>
                      ))}
                    </ul>
                  </div>
                  {!!taskCard?.hint && (
                    <div>
                      <p className="text-gray-500 font-mono text-xs mb-1">HINT</p>
                      <p className="text-yellow-600 font-mono text-xs leading-relaxed">{taskCard.hint}</p>
                    </div>
                  )}
                </div>
              )}

              {taskCard && (
                <>
                  <div className="pt-3 border-t border-gray-800">
                    <p className="text-gray-600 font-mono text-xs tracking-widest mb-2">VISIBLE TESTS</p>
                    {(taskCard?.visibleTests || []).map((test) => (
                      <div key={test.id} className="text-gray-400 font-mono text-xs mb-1">
                        ◻ {test.desc}
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={runTests}
                    disabled={isRunningTests || frozen || amEliminated}
                    className={`w-full py-2 rounded font-mono text-xs font-bold transition-colors ${
                      isRunningTests || frozen || amEliminated
                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-green-700 hover:bg-green-600 text-black'
                    }`}
                  >
                    {isRunningTests ? 'RUNNING TESTS...' : 'RUN TESTS'}
                  </button>
                </>
              )}

              {taskTestResult && (
                <div className="border border-gray-800 rounded p-3 bg-gray-900">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-500 font-mono text-xs tracking-widest">LAST RESULT</p>
                    <p className="font-mono text-xs text-gray-300">
                      {taskTestResult.passed}/{taskTestResult.passed + taskTestResult.failed}
                    </p>
                  </div>

                  {taskTestResult.compileError ? (
                    <pre className="text-red-400 font-mono text-[10px] whitespace-pre-wrap break-words">
                      {taskTestResult.compileError}
                    </pre>
                  ) : (
                    <div className="space-y-1">
                      {(taskTestResult.results || []).map((result) => (
                        <div
                          key={result.id}
                          className={`font-mono text-[10px] ${
                            result.status === 'passed' ? 'text-green-400' : 'text-red-400'
                          }`}
                        >
                          {result.status === 'passed' ? '✅' : '❌'} {result.id}
                          {result.message ? ` — ${result.message}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="h-72 min-h-0">
                <GameChat
                  messages={chatMessages}
                  mySocketId={mySocketId.current}
                  value={chatInput}
                  onChange={setChatInput}
                  onSend={handleSendChatMessage}
                  disabled={false}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {votingPhase && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-red-800 rounded-lg p-6 w-full max-w-sm">
            <h2 className="text-red-400 font-display text-xl tracking-widest mb-2 text-center">VOTE</h2>

            {amEliminated ? (
              <p className="text-gray-600 font-mono text-xs text-center py-4">
                💀 You are eliminated and cannot vote. Watching...
              </p>
            ) : (
              <>
                <p className="text-gray-500 font-mono text-xs text-center mb-4">
                  Who is the Spy?
                </p>

                <div className="space-y-2">
                  {activePlayers.map((player) => (
                    <button
                      key={player.id}
                      onClick={() => castVote(player.id)}
                      disabled={!!myVote || player.id === mySocketId.current}
                      className={`w-full p-2 rounded border font-mono text-xs transition-colors ${
                        player.id === mySocketId.current
                          ? 'border-gray-800 bg-gray-900 text-gray-600 cursor-not-allowed'
                          : myVote === player.id
                          ? 'border-red-600 bg-red-950 text-red-300'
                          : 'border-gray-800 bg-gray-950 hover:bg-gray-900 text-gray-300'
                      }`}
                    >
                      {player.name}
                    </button>
                  ))}

                  <button
                    onClick={() => castVote('skip')}
                    disabled={!!myVote}
                    className={`w-full p-2 rounded border font-mono text-xs transition-colors ${
                      myVote === 'skip'
                        ? 'border-yellow-600 bg-yellow-950 text-yellow-300'
                        : 'border-gray-800 bg-gray-950 hover:bg-gray-900 text-gray-300'
                    }`}
                  >
                    SKIP
                  </button>
                </div>

                <p className="text-gray-600 font-mono text-xs text-center mt-4">
                  Votes: {votes.in}/{votes.total}
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}