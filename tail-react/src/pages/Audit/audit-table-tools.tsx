"use client";
import ResultToolbar from "@/pages/System/ResultToolbar";
export type AuditDensity = "compact" | "default" | "loose";
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
      refresh={p.refresh}
      density={p.density}
      setDensity={p.onDensity}
      fullscreen={p.fullscreen}
      toggleFullscreen={p.onFullscreen}
      columns={p.columns.map((column) => ({
        key: column.key,
        label: `pc.audit.${column.key}`,
      }))}
      visible={p.visible}
      setVisible={(next) =>
        p.onVisible(typeof next === "function" ? next(p.visible) : next)
      }
      settings={p.style}
      setSettings={(next) =>
        p.onStyle(typeof next === "function" ? next(p.style) : next)
      }
    />
  );
}
