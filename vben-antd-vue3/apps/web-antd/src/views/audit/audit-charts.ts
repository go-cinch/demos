import type { ECOption } from '@vben/plugins/echarts';
import type { AuditSummary } from '#/api/audit';
import { formatDateTime } from '@vben/utils';
import { $t } from '#/locales';
export function activityOption(
  summary: AuditSummary | undefined,
  primary: string,
  failure: string,
  selected?: { from: number; to: number },
  modules = false,
  viewport = { start: 0, end: 100 },
  result = '',
): ECOption {
  const visibleSeries = (series: Extract<NonNullable<ECOption['series']>, unknown[]>) =>
    series.filter((item) => !result || item.name === $t(`audit.${result}`));
  if (modules)
    return {
      color: [primary, failure],
      animationDuration: 200,
      tooltip: { trigger: 'axis', renderMode: 'richText' },
      grid: { left: 75, right: 20, top: 12, bottom: 26 },
      xAxis: { type: 'value', minInterval: 1 },
      yAxis: {
        type: 'category',
        inverse: true,
        data: summary?.modules?.map((m) => $t(`audit.modules.${m.name}`)) ?? [],
      },
      series: visibleSeries([
        {
          type: 'bar',
          name: $t('audit.success'),
          color: primary,
          stack: 'events',
          barMaxWidth: 18,
          data: summary?.modules?.map((m) => m.total - m.failed) ?? [],
        },
        {
          type: 'bar',
          name: $t('audit.failure'),
          color: failure,
          stack: 'events',
          data: summary?.modules?.map((m) => m.failed) ?? [],
        },
      ]),
    };
  const buckets = summary?.trend ?? [];
  const isHour = summary?.bucket_ms === 3600000;
  return {
    color: [primary, failure],
    animationDuration: 200,
    tooltip: { trigger: 'axis', renderMode: 'richText' },
    grid: { left: 42, right: 18, top: 18, bottom: 71 },
    xAxis: {
      type: 'category',
      data: buckets.map((b) => formatDateTime(b.at)),
      axisTick: { show: false },
      axisLabel: {
        formatter: (value: string) =>
          isHour ? value.slice(11, 16) : value.slice(5, 10),
        hideOverlap: true,
        interval: 'auto',
      },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { type: 'dashed', opacity: 0.45 } },
    },
    dataZoom: [
      {
        type: 'slider',
        height: 34,
        bottom: 0,
        showDetail: false,
        borderColor: 'transparent',
        brushSelect: true,
        realtime: false,
        start: viewport.start,
        end: viewport.end,
      },
    ],
    series: visibleSeries([
      {
        name: $t('audit.success'),
        color: primary,
        type: 'bar',
        stack: 'events',
        barMaxWidth: 22,
        itemStyle: { borderRadius: [2, 2, 0, 0] },
        data: buckets.map((b) => ({
          value: b.success,
          itemStyle: {
            opacity:
              !selected ||
              (b.at < selected.to &&
                b.at + (summary?.bucket_ms ?? 0) > selected.from)
                ? 0.9
                : 0.3,
          },
        })),
      },
      {
        name: $t('audit.failure'),
        color: failure,
        type: 'bar',
        stack: 'events',
        barMaxWidth: 22,
        data: buckets.map((b) => ({
          value: b.failure,
          itemStyle: {
            opacity:
              !selected ||
              (b.at < selected.to &&
                b.at + (summary?.bucket_ms ?? 0) > selected.from)
                ? 0.9
                : 0.3,
          },
        })),
      },
    ]),
  };
}
