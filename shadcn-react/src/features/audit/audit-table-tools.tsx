'use client';
import ResultToolbar from '@/features/system/components/result-toolbar';
import { ACheck } from '@/features/system/components/admin-ui';
export type AuditDensity = 'compact' | 'default' | 'loose';
export interface AuditStyle {
  bordered: boolean;
  striped: boolean;
  sticky: boolean;
}
interface Props {
  columns: Array<{ key: string; title: string }>;
  visible: string[];
  onVisible: (value: string[]) => void;
  density: AuditDensity;
  onDensity: (value: AuditDensity) => void;
  style: AuditStyle;
  onStyle: (value: AuditStyle) => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  refresh: () => void;
  loading: boolean;
}
export default function AuditTableTools(p: Props) {
  return (
    <ResultToolbar
      loading={p.loading}
      refresh={p.refresh}
      density={p.density}
      setDensity={p.onDensity}
      fullscreen={p.fullscreen}
      toggleFullscreen={p.onFullscreen}
      bordered={p.style.bordered}
      setBordered={(value) => p.onStyle({ ...p.style, bordered: value })}
      striped={p.style.striped}
      setStriped={(value) => p.onStyle({ ...p.style, striped: value })}
      sticky={p.style.sticky}
      setSticky={(value) => p.onStyle({ ...p.style, sticky: value })}
    >
      {p.columns.map((column) => (
        <label key={column.key} className='flex items-center gap-2'>
          <ACheck
            label={column.title}
            checked={p.visible.includes(column.key)}
            onChange={(checked) =>
              p.onVisible(
                checked ? [...p.visible, column.key] : p.visible.filter((key) => key !== column.key)
              )
            }
          />
          {column.title}
        </label>
      ))}
    </ResultToolbar>
  );
}
