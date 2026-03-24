import React, { useState, useEffect, useRef } from 'react';
import Editor from '@monaco-editor/react';
import socket from '../utils/socket';

export default function GameScreen({ gameData, onGameEnd }) {
  const {
    taskCard, skeleton, scenario, players,
    editorContent: initialContent, gameEndTime, isSpy, roomCode, playerName
  } = gameData;

  const [, setEditorContent] = useState(initialContent || {});
  const [timeLeft, setTimeLeft] = useState('');
  const [frozen, setFrozen] = useState(false);
  const [frozenMsg, setFrozenMsg] = useState('');
  const [discussionLeft, setDiscussionLeft] = useState(null);
  const [votingPhase, setVotingPhase] = useState(false);
  const [votes, setVotes] = useState({ in: 0, total: players.length });
  const [myVote, setMyVote] = useState(null);
  const [voteResult, setVoteResult] = useState(null);
  const [emergencyUsed, setEmergencyUsed] = useState(false);
  const [activePlayers, setActivePlayers] = useState(players);
  const [typingPlayer, setTypingPlayer] = useState(null);

  const editorRef    = useRef(null);
  const monacoRef    = useRef(null);
  const mySocketId   = useRef(socket.id);

  // ── Detect language from skeleton ─────────────────────────────
  const language = skeleton?.includes('public class') ? 'java'
                 : skeleton?.includes('def ')         ? 'python'
                 : 'csharp';

  // ── Build combined editor value ───────────────────────────────
  const buildFullCode = React.useCallback((contents) => {
    return activePlayers.map((p) => {
      const region = contents[p.id] || `// ===== ${p.name}'s region =====\n// Write your code here\n`;
      return region;
    }).join('\n\n');
  }, [activePlayers]);

  const [fullCode, setFullCode] = useState(() => buildFullCode(initialContent || {}));

  // ── Timer countdown ───────────────────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      const remaining = Math.max(0, gameEndTime - Date.now());
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      setTimeLeft(`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
      if (remaining === 0) clearInterval(tick);
    }, 500);
    return () => clearInterval(tick);
  }, [gameEndTime]);

  // ── Discussion timer ──────────────────────────────────────────
  useEffect(() => {
    if (!frozen || !discussionLeft) return;
    const tick = setInterval(() => {
      setDiscussionLeft(prev => {
        if (prev <= 1) { clearInterval(tick); setVotingPhase(true); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [frozen, discussionLeft]);

  // ── Socket events ─────────────────────────────────────────────
  useEffect(() => {
    socket.on('code_update', ({ playerId, content }) => {
      setEditorContent(prev => {
        const updated = { ...prev, [playerId]: content };
        setFullCode(buildFullCode(updated));
        return updated;
      });
      // Show typing indicator
      const p = activePlayers.find(pl => pl.id === playerId);
      if (p) {
        setTypingPlayer(p.name);
        setTimeout(() => setTypingPlayer(null), 1500);
      }
    });

    socket.on('freeze_editor', ({ calledBy, discussionEndTime }) => {
      setFrozen(true);
      setFrozenMsg(`🚨 Emergency Call by ${calledBy}! Editor frozen.`);
      setDiscussionLeft(Math.ceil((discussionEndTime - Date.now()) / 1000));
      setVotingPhase(false);
      setVoteResult(null);
      setMyVote(null);
    });

    socket.on('vote_update', ({ votesIn, totalPlayers }) => {
      setVotes({ in: votesIn, total: totalPlayers });
    });

    socket.on('vote_result', ({ ejected, wasTheSpy, players: updatedPlayers }) => {
      setVoteResult({ ejected, wasTheSpy });
      setActivePlayers(updatedPlayers);
      setFrozen(false);
      setVotingPhase(false);
      setFrozenMsg('');
    });

    socket.on('player_left', ({ players: updatedPlayers }) => {
      setActivePlayers(updatedPlayers);
    });

    socket.on('game_end', (data) => {
      onGameEnd(data);
    });

    return () => {
      socket.off('code_update');
      socket.off('freeze_editor');
      socket.off('vote_update');
      socket.off('vote_result');
      socket.off('player_left');
      socket.off('game_end');
    };
  }, [activePlayers, onGameEnd]);

  // ── Editor mounted ────────────────────────────────────────────
  function handleEditorMount(editor, monaco) {
    editorRef.current  = editor;
    monacoRef.current  = monaco;

    monaco.editor.defineTheme('spy-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '4a7c59' },
        { token: 'keyword', foreground: '66d9e8' },
        { token: 'string',  foreground: 'a8d8a8' },
        { token: 'number',  foreground: 'f8a95a' },
      ],
      colors: {
        'editor.background':          '#060b14',
        'editor.foreground':          '#c9e8c9',
        'editor.lineHighlightBackground': '#0d1f2d',
        'editorLineNumber.foreground':'#2a4a3a',
        'editorCursor.foreground':    '#00ff88',
        'editor.selectionBackground': '#1a3a2a',
      }
    });
    monaco.editor.setTheme('spy-dark');
  }

  // ── Handle local edits — only send my region ──────────────────
  function handleEditorChange(value) {
    if (frozen) return;
    setFullCode(value);

    // Extract just my region and send it
    const lines = value.split('\n');
    const myMarker = `// ===== ${playerName}`;
    let inMine = false;
    let myLines = [];
    for (const line of lines) {
      if (line.includes(myMarker)) { inMine = true; myLines.push(line); continue; }
      if (inMine && line.startsWith('// =====') && !line.includes(myMarker)) break;
      if (inMine) myLines.push(line);
    }
    const myContent = myLines.join('\n');
    setEditorContent(prev => ({ ...prev, [mySocketId.current]: myContent }));
    socket.emit('code_delta', { roomCode, content: myContent });
  }

  // ── Emergency call ────────────────────────────────────────────
  function handleEmergency() {
    if (emergencyUsed || frozen) return;
    setEmergencyUsed(true);
    socket.emit('emergency_call', { roomCode });
  }

  // ── Cast vote ─────────────────────────────────────────────────
  function castVote(targetId) {
    if (myVote) return;
    setMyVote(targetId);
    socket.emit('cast_vote', { roomCode, votedFor: targetId });
  }

  // ── Timer color ───────────────────────────────────────────────
  const [mins] = timeLeft.split(':');
  const timerColor = parseInt(mins) <= 1 ? 'text-red-400 blink'
                   : parseInt(mins) <= 3 ? 'text-yellow-400'
                   : 'text-green-400';

  return (
    <div className="min-h-screen flex flex-col bg-gray-950" style={{ height: '100vh' }}>

      {/* ── TOP BAR ── */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 bg-gray-950 flex-shrink-0">
        <span className="text-green-500 font-display tracking-widest text-lg">CODE SPY</span>
        <div className="flex items-center gap-4">
          <span className="text-gray-600 font-mono text-xs">{roomCode}</span>
          <span className={`font-display text-2xl ${timerColor}`}>⏱ {timeLeft}</span>
        </div>
        <span className={`font-mono text-xs px-2 py-1 rounded ${
          isSpy ? 'bg-red-950 text-red-400 border border-red-800'
                : 'bg-green-950 text-green-400 border border-green-800'
        }`}>
          {isSpy ? '🔴 SPY' : '🟢 CODER'}
        </span>
      </div>

      {/* ── FREEZE BANNER ── */}
      {frozen && (
        <div className="bg-red-950 border-b border-red-800 px-4 py-2 flex items-center justify-between flex-shrink-0">
          <span className="text-red-400 font-mono text-sm">{frozenMsg}</span>
          {!votingPhase && discussionLeft !== null && (
            <span className="text-red-300 font-mono text-sm">
              voting in {discussionLeft}s
            </span>
          )}
          {votingPhase && (
            <span className="text-yellow-400 font-mono text-sm blink">VOTE NOW</span>
          )}
        </div>
      )}

      {/* ── VOTE RESULT BANNER ── */}
      {voteResult && (
        <div className="bg-blue-950 border-b border-blue-800 px-4 py-2 text-center flex-shrink-0">
          {voteResult.ejected
            ? <span className="text-blue-300 font-mono text-sm">
                ⚖️ <strong>{voteResult.ejected}</strong> was ejected.{' '}
                {voteResult.wasTheSpy ? '✅ They were the Spy!' : '❌ They were innocent.'}
              </span>
            : <span className="text-blue-300 font-mono text-sm">⚖️ No one was ejected. Game resumes.</span>
          }
        </div>
      )}

      {/* ── MAIN CONTENT ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Players panel */}
        <div className="w-44 border-r border-gray-800 bg-gray-950 flex flex-col flex-shrink-0">
          <div className="px-3 py-2 border-b border-gray-800">
            <p className="text-gray-600 font-mono text-xs tracking-widest">PLAYERS</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {activePlayers.map(p => {
              const isMe = p.id === mySocketId.current;
              const isTyping = typingPlayer === p.name;
              return (
                <div key={p.id} className={`rounded p-2 border ${
                  isMe ? 'border-green-800 bg-green-950'
                       : 'border-gray-800 bg-gray-900'
                }`}>
                  <div className="flex items-center gap-1">
                    <span className={`text-xs ${isMe ? 'text-green-400' : 'text-gray-400'}`}>
                      {isTyping ? '✍️' : '●'}
                    </span>
                    <span className={`font-mono text-xs truncate ${isMe ? 'text-green-300' : 'text-gray-300'}`}>
                      {p.name}
                    </span>
                  </div>
                  {isMe && <div className="text-green-700 font-mono text-xs mt-1">you</div>}
                </div>
              );
            })}
          </div>

          {/* Emergency button */}
          <div className="p-2 border-t border-gray-800">
            <button
              onClick={handleEmergency}
              disabled={emergencyUsed || frozen}
              className={`w-full py-2 rounded font-mono text-xs font-bold transition-colors ${
                emergencyUsed || frozen
                  ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                  : 'bg-red-900 hover:bg-red-700 text-red-300 border border-red-800'
              }`}
            >
              {emergencyUsed ? '🚨 USED' : '🚨 EMERGENCY'}
            </button>
          </div>
        </div>

        {/* CENTER: Editor */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {typingPlayer && (
            <div className="px-3 py-1 bg-gray-900 border-b border-gray-800 flex-shrink-0">
              <span className="text-yellow-600 font-mono text-xs">✍ {typingPlayer} is typing...</span>
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <Editor
              height="100%"
              language={language}
              value={fullCode}
              onChange={handleEditorChange}
              onMount={handleEditorMount}
              options={{
                fontSize: 13,
                fontFamily: '"JetBrains Mono", monospace',
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                lineNumbers: 'on',
                renderLineHighlight: 'line',
                readOnly: frozen,
                cursorBlinking: 'smooth',
                smoothScrolling: true,
                contextmenu: false,
              }}
            />
          </div>
        </div>

        {/* RIGHT: Task card */}
        <div className="w-56 border-l border-gray-800 bg-gray-950 flex flex-col flex-shrink-0">
          <div className="px-3 py-2 border-b border-gray-800">
            <p className="text-gray-600 font-mono text-xs tracking-widest">MY TASK</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {isSpy ? (
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
                      <li key={i} className="text-gray-300 font-mono text-xs leading-relaxed">
                        · {r}
                      </li>
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

            {/* Tests */}
            <div className="mt-4 pt-4 border-t border-gray-800">
              <p className="text-gray-600 font-mono text-xs tracking-widest mb-2">TEST CASES</p>
              {(scenario?.tests || []).map((t, i) => (
                <div key={i} className="text-gray-600 font-mono text-xs mb-1">
                  ◻ {t.desc}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── VOTE MODAL ── */}
      {votingPhase && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-red-800 rounded-lg p-6 w-full max-w-sm">
            <h2 className="text-red-400 font-display text-xl tracking-widest mb-2 text-center">VOTE</h2>
            <p className="text-gray-500 font-mono text-xs text-center mb-4">
              Who is the Spy? ({votes.in}/{votes.total} votes cast)
            </p>
            <div className="space-y-2 mb-4">
              {activePlayers.map(p => {
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
            {myVote && (
              <p className="text-green-600 font-mono text-xs text-center">
                ✓ Vote cast. Waiting for others...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}