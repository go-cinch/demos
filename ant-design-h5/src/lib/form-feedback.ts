import { t } from '../locales';

export interface Message {
  key: string;
  vars?: Record<string, string | number> | (() => Record<string, string | number>);
}

export type Feedback = Message | string;

export const message = (key: string, vars?: Message['vars']): Message => ({ key, vars });

export const resolveMessage = (value?: Feedback) =>
  typeof value === 'string'
    ? value
    : value
      ? t(value.key, typeof value.vars === 'function' ? value.vars() : value.vars)
      : '';
