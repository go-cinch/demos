import { t } from '../locales';
import { Sheet, Toggle } from './UI';
import { Choices } from './Settings';
export default function ResultOptions({
  options,
  setOptions,
  density,
  setDensity,
  size,
  setSize,
  setPage,
  columns,
  setColumns,
  fields,
  identity,
  bordered,
  setBordered,
  striped,
  setStriped,
  sticky,
  setSticky,
}: {
  options: string;
  setOptions: (v: string) => void;
  density: string;
  setDensity: (v: string) => void;
  size: number;
  setSize: (v: number) => void;
  setPage: (v: number) => void;
  columns: string[];
  setColumns: (fn: (all: string[]) => string[]) => void;
  fields: { key: string; title: string }[];
  identity: string;
  bordered: boolean;
  setBordered: (v: boolean) => void;
  striped: boolean;
  setStriped: (v: boolean) => void;
  sticky: boolean;
  setSticky: (v: boolean) => void;
}) {
  return (
    <Sheet open={!!options} onClose={() => setOptions('')} title={t(options)}>
      {options === 'system.table.density' ? (
        <Choices
          value={density}
          onChange={(v) => setDensity(String(v))}
          options={['compact', 'default', 'loose'].map((value) => ({
            value,
            label: t(`system.table.${value}`),
          }))}
        />
      ) : options === 'pageSize' ? (
        <Choices
          value={size}
          onChange={(v) => {
            setSize(Number(v));
            setPage(1);
          }}
          options={[10, 20, 50, 100].map((value) => ({
            value,
            label: `${value} / ${t('pageUnit')}`,
          }))}
        />
      ) : options === 'system.table.visibleColumns' ? (
        <>
          <p className="notice">{t('columnsHint')}</p>
          {fields.map((c) => (
            <Toggle
              key={c.key}
              label={c.title}
              checked={columns.includes(c.key)}
              disabled={c.key === identity}
              onChange={(v) => {
                if (c.key === identity) return;
                setColumns((all) => (v ? [...all, c.key] : all.filter((x) => x !== c.key)));
              }}
            />
          ))}
        </>
      ) : (
        <>
          <Toggle label={t('system.table.bordered')} checked={bordered} onChange={setBordered} />
          <Toggle label={t('system.table.striped')} checked={striped} onChange={setStriped} />
          <Toggle label={t('system.table.sticky')} checked={sticky} onChange={setSticky} />
        </>
      )}
    </Sheet>
  );
}
