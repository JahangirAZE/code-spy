import React from 'react';
import Editor from '@monaco-editor/react';

export default function RegionEditor({
  title,
  value,
  language,
  editable,
  locked,
  onChange
}) {
  return (
    <div className={`border rounded-lg overflow-hidden mb-4 ${locked ? 'border-gray-800' : 'border-green-800'}`}>
      <div className={`px-3 py-2 font-mono text-xs border-b ${locked ? 'bg-gray-900 text-gray-400 border-gray-800' : 'bg-green-950 text-green-300 border-green-800'}`}>
        {title} {editable ? '• editable' : '• locked'}
      </div>

      <Editor
        height="200px"
        language={language}
        value={value}
        onChange={(v) => editable && onChange(v || '')}
        theme="vs-dark"
        options={{
          readOnly: !editable,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: '"JetBrains Mono", monospace',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          domReadOnly: !editable,
          lineNumbers: 'on'
        }}
      />
    </div>
  );
}
