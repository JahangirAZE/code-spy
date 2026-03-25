import React, { useEffect, useState } from 'react';

export default function DisruptionScreen({ type, data = {}, onReturnHome }) {
  const [countdown, setCountdown] = useState(10);
  const [glitch, setGlitch] = useState(false);

  const isHostLeft = type === 'host_disconnected';
  const isSpyLeft = type === 'spy_left';

  useEffect(() => {
    if (countdown <= 0) {
      onReturnHome();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, onReturnHome]);

  useEffect(() => {
    setGlitch(true);
    const t = setTimeout(() => setGlitch(false), 600);
    return () => clearTimeout(t);
  }, []);

  const accentColor = isHostLeft ? 'yellow' : 'red';

  const title = isHostLeft ? 'HOST LEFT' : 'SPY FLED';

  const subtitle = isHostLeft
    ? `${data.hostName || 'The host'} disconnected — the room has been destroyed.`
    : `${data.spyName || 'The spy'} rage-quit before being caught.`;

  const detail = isHostLeft
    ? data.wasInGame
      ? 'The game has ended. Everyone is being sent back to the lobby.'
      : 'The lobby has been closed. Please create or join a new room.'
    : 'The coders win by default — the spy abandoned their mission!';

  const colors = {
    yellow: {
      border: 'border-yellow-600',
      bg: 'bg-yellow-950 bg-opacity-40',
      title: 'text-yellow-400',
      accent: 'text-yellow-300',
      bar: 'bg-yellow-500',
      glow: 'rgba(120,80,0,0.35)',
      btn: 'bg-yellow-700 hover:bg-yellow-600 text-black'
    },
    red: {
      border: 'border-red-600',
      bg: 'bg-red-950 bg-opacity-40',
      title: 'text-red-400',
      accent: 'text-red-300',
      bar: 'bg-red-500',
      glow: 'rgba(80,0,0,0.4)',
      btn: 'bg-red-700 hover:bg-red-600 text-white'
    }
  }[accentColor];

  const allPlayers = [...(data.players || []), ...(data.eliminatedPlayers || []).map(p => ({ ...p, eliminated: true }))];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* Background glow */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at center, ${colors.glow} 0%, transparent 65%)`
        }}
      />

      {/* Scan-line texture overlay */}
      <div
        className="fixed inset-0 pointer-events-none opacity-5"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)'
        }}
      />

      <div className={`w-full max-w-md relative z-10 space-y-5 transition-all duration-100 ${glitch ? 'translate-x-1 opacity-80' : ''}`}>

        {/* ── MAIN CARD ── */}
        <div className={`border ${colors.border} rounded-lg overflow-hidden ${colors.bg}`}>

          {/* Header strip */}
          <div className={`border-b ${colors.border} px-5 py-3 flex items-center gap-2`}>
            <span className="font-mono text-xs text-gray-500 tracking-widest">SYSTEM ERROR</span>
            <span className="ml-auto font-mono text-xs text-gray-700">CODE_SPY</span>
          </div>

          {/* Icon + title */}
          <div className="px-6 pt-8 pb-6 text-center space-y-3">
            <div className="text-5xl mb-2">
              {isHostLeft ? '🔌' : '🏃'}
            </div>
            <h1 className={`font-display text-4xl tracking-widest ${colors.title}`}>
              {title}
            </h1>
            <p className={`font-mono text-sm ${colors.accent} leading-relaxed`}>
              {subtitle}
            </p>
            <p className="font-mono text-xs text-gray-500 leading-relaxed">
              {detail}
            </p>
          </div>

          {/* Spy task reveal — only for spy_left */}
          {isSpyLeft && data.spyTask && (
            <div className="mx-5 mb-5 bg-gray-950 rounded border border-red-900 p-4 space-y-2">
              <p className="text-gray-500 font-mono text-xs tracking-widest">THEIR ABANDONED MISSION</p>
              <p className="text-gray-400 font-mono text-xs">
                <span className="text-red-400">Method:</span> {data.spyTask.method}
              </p>
              <p className="text-gray-400 font-mono text-xs leading-relaxed">
                <span className="text-red-400">Sabotage:</span> {data.spyTask.sabotage}
              </p>
            </div>
          )}

          {/* Player list — shown for spy_left */}
          {isSpyLeft && allPlayers.length > 0 && (
            <div className="mx-5 mb-5 space-y-2">
              <p className="text-gray-500 font-mono text-xs tracking-widest mb-2">PLAYERS</p>
              {allPlayers.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center gap-2 rounded px-3 py-2 border font-mono text-xs ${
                    p.eliminated
                      ? 'border-gray-800 bg-gray-900 text-gray-600 opacity-50'
                      : 'border-gray-700 bg-gray-900 text-gray-300'
                  }`}
                >
                  <span>{p.eliminated ? '💀' : '🟢'}</span>
                  <span className={p.eliminated ? 'line-through' : ''}>{p.name}</span>
                  {p.eliminated && <span className="ml-auto text-gray-700">ejected</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── AUTO-RETURN COUNTDOWN ── */}
        <div className="border border-gray-800 rounded-lg overflow-hidden bg-gray-950">
          <div className="px-4 py-3 flex items-center justify-between">
            <span className="font-mono text-xs text-gray-600">
              Returning to lobby in <span className={`${colors.accent} font-bold`}>{countdown}s</span>
            </span>
            <button
              onClick={onReturnHome}
              className={`font-mono text-xs font-bold px-4 py-2 rounded transition-colors ${colors.btn}`}
            >
              ↩ GO NOW
            </button>
          </div>
          {/* progress bar */}
          <div className="h-0.5 bg-gray-800">
            <div
              className={`h-full ${colors.bar} transition-all duration-1000 ease-linear`}
              style={{ width: `${(countdown / 10) * 100}%` }}
            />
          </div>
        </div>

      </div>
    </div>
  );
}