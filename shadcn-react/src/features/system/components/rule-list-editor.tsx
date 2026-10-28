'use client';
import { useEffect, useRef, useState } from 'react';
import { AButton, useAdminText } from './admin-ui';
export default function RuleListEditor({
  label,
  value,
  onChange
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const text = useAdminText();
  const [rows, setRows] = useState(() => value.split(/\r?\n/));
  const last = useRef(value);
  useEffect(() => {
    if (last.current !== value) {
      last.current = value;
      setRows(value.split(/\r?\n/));
    }
  }, [value]);
  function publish(next: string[]) {
    setRows(next);
    last.current = next.join('\n');
    onChange(last.current);
  }
  return (
    <div className='space-y-2' data-testid='rule-list-editor'>
      {rows.map((row, index) => (
        <div key={index} className='flex gap-2 rounded-lg border p-2'>
          <textarea
            aria-label={`${label} ${index + 1}`}
            rows={1}
            className='min-w-0 flex-1 resize-y rounded bg-transparent p-2 font-mono text-sm'
            value={row}
            onChange={(event) =>
              publish(rows.map((value, i) => (i === index ? event.target.value : value)))
            }
            onBlur={() => publish(rows.flatMap((value) => value.split(/\r?\n/)))}
          />
          <AButton onClick={() => publish(rows.filter((_, i) => i !== index))}>
            {text('system-editor.removeItem', { name: `${label} ${index + 1}` })}
          </AButton>
        </div>
      ))}
      <AButton onClick={() => publish([...rows, ''])}>
        {text('system-editor.addItem', { entity: label })}
      </AButton>
    </div>
  );
}
