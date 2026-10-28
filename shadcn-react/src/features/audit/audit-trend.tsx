'use client';
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Brush
} from 'recharts';
import type { AuditSummary } from '@/features/admin/model';
import { adminDate } from '@/features/admin/model';
export default function AuditTrend({
  summary,
  result,
  timezone,
  text,
  onScope
}: {
  summary?: AuditSummary;
  result: string;
  timezone: string;
  text: (key: string) => string;
  onScope: (from: number, to: number) => void;
}) {
  const points = summary?.trend ?? [];
  return (
    <div className='h-64' data-testid='audit-trend'>
      <ResponsiveContainer width='100%' height='100%'>
        <AreaChart
          data={points}
          onClick={(event) => {
            const index = Number(event.activeTooltipIndex);
            const point = points[index];
            if (point) onScope(point.at, point.at + (summary?.bucket_ms ?? 3600000));
          }}
        >
          <CartesianGrid strokeDasharray='3 3' vertical={false} />
          <XAxis
            dataKey='at'
            tickFormatter={(value) => adminDate(Number(value), timezone).slice(5, 16)}
          />
          <YAxis allowDecimals={false} />
          <Tooltip labelFormatter={(value) => adminDate(Number(value), timezone)} />
          {result !== 'failure' && (
            <Area
              dataKey='success'
              name={text('audit.success')}
              stroke='var(--primary)'
              fill='var(--primary)'
              fillOpacity={0.15}
            />
          )}
          {result !== 'success' && (
            <Area
              dataKey='failure'
              name={text('audit.failure')}
              stroke='var(--destructive)'
              fill='var(--destructive)'
              fillOpacity={0.12}
            />
          )}
          <Brush
            dataKey='at'
            height={24}
            tickFormatter={(value) => adminDate(Number(value), timezone).slice(11, 16)}
            onChange={(range) => {
              if (range.startIndex === undefined || range.endIndex === undefined) return;
              const first = points[range.startIndex],
                last = points[range.endIndex];
              if (first && last) onScope(first.at, last.at + (summary?.bucket_ms ?? 3600000));
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
