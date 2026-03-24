import React, { useEffect, useState } from 'react';

export default function EndScreen({ endData, onPlayAgain }) {
  const { winner, message, spyName, spyTask, finalCode, players } = endData;
  const [revealed, setRevealed] = useState(false);
  const [showCode, setShowCode] = useState(false);

  const codersWin = winner === 'coders';

  // Dramatic reveal after 1 second
  useEffect(() => {
    const t = setTimeout(() => setRevealed(true), 1000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">

      {/* Animated background glow */}
      <div className={`fixed inset-0 pointer-events-none transition-all duration-2000 ${
        codersWin
          ? 'bg-gradient-radial from-green-950 via-transparent to-transparent'
          : 'bg-gradient-radial from-red-950 via-transparent to-transparent'
      }`} style={{
        background: codersWin
          ? 'radial-gradient(ellipse at center, rgba(0,60,20,0.4) 0%, transparent 70%)'
          : 'radial-gradient(ellipse at center, rgba(60,0,0,0.4) 0%, transparent 70%)'
      }} />

      <div className="w-full max-w-lg relative z-10 space-y-6">

        {/* ── WINNER BANNER ── */}
        <div className={`border rounded-lg p-8 text-center ${
          codersWin
            ? 'border-green-600 bg-green-950 bg-opacity-60'
            : 'border-red-600 bg-red-950 bg-opacity-60'
        }`}>
          <div className={`font-display text-5xl tracking-widest mb-3 ${
            codersWin ? 'text-green-400' : 'text-red-400'
          }`}>
            {codersWin ? '✅ CODERS WIN' : '🔴 SPY WINS'}
          </div>
          <p className="text-gray-300 font-mono text-sm">{message}</p>
        </div>

        {/* ── SPY REVEAL ── */}
        <div className={`border border-gray-700 rounded-lg overflow-hidden transition-all duration-700 ${
          revealed ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}>
          <div className="bg-gray-900 px-4 py-2 border-b border-gray-700">
            <p className="text-gray-500 font-mono text-xs tracking-widest">SPY REVEAL</p>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-red-500 text-xl">🔴</span>
              <div>
                <p className="text-gray-500 font-mono text-xs">THE SPY WAS</p>
                <p className="text-red-300 font-mono text-lg font-bold">{spyName}</p>
              </div>
            </div>

            {spyTask && (
              <div className="bg-gray-950 rounded p-3 border border-red-900 space-y-2">
                <p className="text-gray-500 font-mono text-xs tracking-widest">THEIR MISSION</p>
                <p className="text-gray-400 font-mono text-xs">
                  <span className="text-red-400">Method:</span> {spyTask.method}
                </p>
                <p className="text-gray-400 font-mono text-xs leading-relaxed">
                  <span className="text-red-400">Sabotage:</span> {spyTask.sabotage}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── PLAYERS SUMMARY ── */}
        <div className="border border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-900 px-4 py-2 border-b border-gray-700">
            <p className="text-gray-500 font-mono text-xs tracking-widest">PLAYERS</p>
          </div>
          <div className="p-3 space-y-2">
            {players.map(p => {
              const isSpy = p.name === spyName;
              return (
                <div key={p.id} className={`flex items-center gap-3 rounded p-2 ${
                  isSpy ? 'bg-red-950 border border-red-900' : 'bg-gray-900 border border-gray-800'
                }`}>
                  <span>{isSpy ? '🔴' : '🟢'}</span>
                  <span className={`font-mono text-sm ${isSpy ? 'text-red-300' : 'text-gray-300'}`}>
                    {p.name}
                  </span>
                  <span className={`ml-auto font-mono text-xs ${isSpy ? 'text-red-500' : 'text-green-700'}`}>
                    {isSpy ? 'SPY' : 'CODER'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── FINAL CODE TOGGLE ── */}
        <div className="border border-gray-700 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowCode(v => !v)}
            className="w-full bg-gray-900 px-4 py-3 text-left flex items-center justify-between hover:bg-gray-800 transition-colors"
          >
            <p className="text-gray-500 font-mono text-xs tracking-widest">FINAL CODE</p>
            <span className="text-gray-600 font-mono text-xs">{showCode ? '▲ hide' : '▼ show'}</span>
          </button>
          {showCode && (
            <div className="overflow-x-auto">
              <pre className="p-4 text-green-300 font-mono text-xs leading-relaxed bg-gray-950 max-h-64 overflow-y-auto">
                {finalCode
                  ? Object.entries(finalCode).map(([id, code]) => {
                      const player = players.find(p => p.id === id);
                      return `// ===== ${player?.name || id} =====\n${code}`;
                    }).join('\n\n')
                  : '// No code submitted'
                }
              </pre>
            </div>
          )}
        </div>

        {/* ── PLAY AGAIN ── */}
        <button
          onClick={onPlayAgain}
          className="w-full bg-green-700 hover:bg-green-600 text-black font-bold font-mono py-4 rounded text-lg transition-colors"
        >
          ▶ PLAY AGAIN
        </button>
      </div>
    </div>
  );
}