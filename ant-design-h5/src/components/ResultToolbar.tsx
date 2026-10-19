import type { ReactNode } from 'react';
import { t } from '../locales';
import { IconButton } from './UI';
export default function ResultToolbar({
  children,
  refresh,
  options,
  disabled = false,
}: {
  children?: ReactNode;
  refresh: () => void;
  options: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="result-toolbar">
      <div>{children}</div>
      <div className="result-tools">
        {[
          ['refresh', 'system.common.refresh'],
          ['view-list', 'system.table.density'],
          ['view-column', 'system.table.visibleColumns'],
          ['table', 'system.table.style'],
        ].map(([name, key]) => (
          <IconButton
            key={name}
            name={name}
            label={t(key)}
            disabled={disabled && name === 'refresh'}
            onClick={() => (name === 'refresh' ? refresh() : options(key))}
          />
        ))}
      </div>
    </div>
  );
}
