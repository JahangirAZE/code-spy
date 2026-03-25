import React, { useEffect, useMemo, useRef } from 'react';

const MAX_CHAT_MESSAGE_LENGTH = 100;

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });
}

function ChatMessage({ item, isMine }) {
  return (
    <div
      className={`rounded border px-2 py-2 ${
        isMine
          ? 'border-green-800 bg-green-950/40'
          : 'border-gray-800 bg-gray-900'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span
          className={`font-mono text-[11px] truncate ${
            isMine ? 'text-green-300' : 'text-blue-300'
          }`}
        >
          {item.senderName}
        </span>
        <span className="font-mono text-[10px] text-gray-600 flex-shrink-0">
          {formatTime(item.timestamp)}
        </span>
      </div>

      <div className="font-mono text-[11px] leading-relaxed break-words text-gray-300">
        {item.message}
      </div>
    </div>
  );
}

export default function GameChat({
  messages = [],
  mySocketId,
  value,
  onChange,
  onSend,
  disabled = false
}) {
  const listRef = useRef(null);

  const remainingChars = useMemo(
    () => MAX_CHAT_MESSAGE_LENGTH - value.length,
    [value]
  );

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  function handleSubmit(event) {
    event.preventDefault();
    if (disabled) return;
    onSend();
  }

  return (
    <div className="border-t border-gray-800 bg-gray-950/90 flex flex-col min-h-0 h-full">
      <div className="px-3 py-2 border-b border-gray-800">
        <p className="text-gray-600 font-mono text-xs tracking-widest">CHAT</p>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {messages.length === 0 ? (
          <div className="text-[11px] text-gray-600 font-mono px-1 py-2">
            No messages yet.
          </div>
        ) : (
          messages.map((item) => (
            <ChatMessage
              key={item.id}
              item={item}
              isMine={item.senderId === mySocketId}
            />
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-800 p-2 space-y-2">
        <textarea
          value={value}
          onChange={(event) => onChange(event.target.value.slice(0, MAX_CHAT_MESSAGE_LENGTH))}
          disabled={disabled}
          rows={1}
          placeholder={disabled ? 'Chat unavailable' : 'Type a message...'}
          className="w-full resize-none rounded border border-gray-800 bg-gray-900 px-2 py-1 text-gray-300 font-mono text-[11px] outline-none focus:border-green-700 disabled:opacity-50 leading-tight"
        />

        <div className="flex items-center justify-between gap-2">
          <span
            className={`font-mono text-[10px] ${
              remainingChars <= 10 ? 'text-yellow-500' : 'text-gray-600'
            }`}
          >
            {value.length}/{MAX_CHAT_MESSAGE_LENGTH}
          </span>

          <button
            type="submit"
            disabled={disabled || !value.trim()}
            className={`px-3 py-2 rounded font-mono text-[11px] border transition-colors ${
              disabled || !value.trim()
                ? 'bg-gray-800 text-gray-600 border-gray-800 cursor-not-allowed'
                : 'bg-green-950 text-green-300 border-green-800 hover:bg-green-900'
            }`}
          >
            SEND
          </button>
        </div>
      </form>
    </div>
  );
}