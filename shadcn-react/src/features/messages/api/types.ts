export interface Msg {
  id: number;
  title: string;
  content?: string;
  summary?: string;
  recipients?: Array<{ id: number; username: string; code: string }>;
  type: 'system' | 'notice';
  scope: 'all' | 'targeted';
  sender_id: number | null;
  published_at: number;
  expired_at: number | null;
  read_at: number | null;
  recipient_ids?: number[];
}
export interface MsgPage {
  items: Msg[];
  t: number;
  p: number;
  s: number;
}
export interface MsgInput {
  title: string;
  content: string;
  type: 'system' | 'notice';
  scope: 'all' | 'targeted';
  recipient_ids?: number[];
  expired_at: number | null;
}
export interface MsgUser {
  id: number;
  username: string;
}

export interface MsgSentSummary {
  total: number;
  counts: {
    notice: number;
    system: number;
    all: number;
    targeted: number;
    latest_published_at: number | null;
  };
}
