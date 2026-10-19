import { useState } from 'react';
import { Button, DatePickerView, Input } from 'antd-mobile';
import dayjs from 'dayjs';
import { dateTime, parseDateTime } from '../lib/format';
import { t } from '../locales';
import { Icon, Sheet } from './UI';

export default function DateTimeField({
  id,
  name,
  value,
  onChange,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => dayjs().add(1, 'day').toDate());
  const parsed = parseDateTime(value);
  function pick() {
    setDraft(parsed.isValid() ? parsed.toDate() : dayjs().add(1, 'day').toDate());
    setOpen(true);
  }
  return (
    <div className="date-time-input">
      <Input id={id} name={name} value={value} onChange={onChange} placeholder={t('dateFormat')} />
      <button type="button" className="date-picker-trigger" onClick={pick}>
        <Icon name="time" size={17} />
        <span>{t('pickDateTime')}</span>
        <Icon name="chevron-right" size={15} />
      </button>
      <div className="time-presets">
        {(
          [
            ['oneHour', 1],
            ['oneDay', 24],
            ['oneWeek', 168],
          ] as const
        ).map(([label, hours]) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(dateTime(dayjs().add(hours, 'hour').valueOf()))}
          >
            {t(label)}
          </button>
        ))}
      </div>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('pickDateTime')}
        footer={
          <Button
            block
            color="primary"
            onClick={() => {
              onChange(dateTime(draft.valueOf()));
              setOpen(false);
            }}
          >
            {t('done')}
          </Button>
        }
      >
        <DatePickerView
          value={draft}
          onChange={setDraft}
          precision="second"
          min={dayjs().startOf('day').toDate()}
          max={dayjs().add(20, 'year').toDate()}
        />
        <p className="notice">{dateTime(draft.valueOf())}</p>
      </Sheet>
    </div>
  );
}
