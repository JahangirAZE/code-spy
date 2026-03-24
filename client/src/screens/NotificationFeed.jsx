import React from 'react';

function getTypeStyles(type) {
  switch (type) {
    case 'emergency':
      return 'border-red-800 bg-red-950/70 text-red-200';
    case 'timer':
      return 'border-yellow-800 bg-yellow-950/60 text-yellow-200';
    case 'typing':
      return 'border-blue-800 bg-blue-950/50 text-blue-200';
    case 'system':
    default:
      return 'border-gray-800 bg-gray-900 text-gray-300';
  }
}

export default function NotificationFeed({ items }) {
  return (
    <div className="border-t border-gray-800 bg-gray-950/80 flex flex-col min-h-0 h-full">
      <div className="px-3 py-2 border-b border-gray-800">
        <p className="text-gray-600 font-mono text-xs tracking-widest">ACTIVITY</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {items.length === 0 ? (
          <div className="text-[11px] text-gray-600 font-mono px-1 py-2">
            No live updates yet.
          </div>
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className={`rounded border px-2 py-2 text-[11px] font-mono transition-all duration-300 ${getTypeStyles(
                item.type
              )}`}
            >
              <div className="leading-relaxed break-words">{item.message}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
