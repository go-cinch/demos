export type ResourceKind = 'user' | 'role' | 'user-group' | 'action' | 'whitelist' | 'dictionary';
export interface ActionRecord {
  id: number;
  name: string;
  word: string;
  code: string;
  group: string;
  menu: string;
  button: string;
  resource: string;
  created_at: number;
  updated_at: number;
}
export interface RecordData {
  id: number;
  name?: string;
  username?: string;
  code?: string;
  word?: string;
  key?: string;
  status?: number;
  enabled?: boolean;
  resource?: string;
  category?: number;
  metadata?: Record<string, unknown>;
  role_id?: number;
  role?: { id: number; name: string; word: string };
  actions?: ActionRecord[];
  action_codes?: string[];
  users?: { id: number; username: string; code: string }[];
  created_at: number;
  updated_at: number;
  [key: string]: unknown;
}
export interface PageResult {
  items: RecordData[];
  p: number;
  s: number;
  t: number;
}
export interface AuthInfo {
  id: number;
  username: string;
  code: string;
  role?: { id: number; name: string; word: string };
  permission: { menus: string[]; btns: string[] };
}
export interface SessionResult {
  access_token: string;
  refresh_token: string;
  expired_at: number;
  password_reset_required: boolean;
}
export interface CaptchaPoint {
  x: number;
  y: number;
}
export interface PointCaptcha {
  captcha_id: string;
  captcha_image: string;
  expired_at: number;
  width: number;
  height: number;
  hint_text: string;
  target_count: number;
}
