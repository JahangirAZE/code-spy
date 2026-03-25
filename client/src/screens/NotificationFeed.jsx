const TYPE_STYLES = {
  emergency: 'border-red-800 bg-red-950/70 text-red-200',
  timer: 'border-yellow-800 bg-yellow-950/60 text-yellow-200',
  typing: 'border-blue-800 bg-blue-950/50 text-blue-200',
  warning: 'border-orange-800 bg-orange-950/60 text-orange-200',
  system: 'border-gray-800 bg-gray-900 text-gray-300'
};

function getTypeStyles(type) {
  return TYPE_STYLES[type] || TYPE_STYLES.system;
}

function NotificationItem({ item }) {
  return (
    <div className={`rounded border px-2 py-2 text-[11px] font-mono transition-all duration-300 ${getTypeStyles(item.type)}`}>
      <div className="leading-relaxed break-words">
        {item.message}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="text-[11px] text-gray-600 font-mono px-1 py-2">
      No live updates yet.
    </div>
  );
}

export default function NotificationFeed({ items = [] }) {
  return (
    <div className="border-t border-gray-800 bg-gray-950/80 flex flex-col min-h-0 h-full">
      <div className="px-3 py-2 border-b border-gray-800">
        <p className="text-gray-600 font-mono text-xs tracking-widest">ACTIVITY</p>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          items.map((item) => <NotificationItem key={item.id} item={item} />)
        )}
      </div>
    </div>
  );
}
