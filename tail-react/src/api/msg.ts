import { apiRequest } from "./client";
export interface Msg {
  id: number;
  title: string;
  content: string;
  type: "system" | "notice";
  scope: "all" | "targeted";
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
  type: "system" | "notice";
  scope: "all" | "targeted";
  recipient_ids?: number[];
  expired_at: number | null;
}
export interface MsgUser {
  id: number;
  username: string;
}

export function msgChanged() {
  window.dispatchEvent(new Event("cinch-msg-changed"));
}
export const msgApi = {
  list: (sent: boolean, params: Record<string, string | number | boolean>) =>
    apiRequest<MsgPage>(
      `${sent ? "/msg/sent" : "/msg/inbox"}?${new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))}`,
    ),
  get: (id: number, sent: boolean) =>
    apiRequest<Msg>(`/msg/${sent ? "sent" : "inbox"}/${id}`),
  count: () => apiRequest<{ count: number }>("/msg/unread-count"),
  read: (id: number) =>
    apiRequest(`/msg/inbox/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ read: true }),
    }),
  readAll: () => apiRequest("/msg/inbox/read-all", { method: "POST" }),
  remove: (id: number, sent: boolean) =>
    apiRequest(`/msg/${sent ? "sent" : "inbox"}/${id}`, { method: "DELETE" }),
  send: (body: MsgInput, key: string) =>
    apiRequest<Msg>("/msg", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "x-idempotent": key },
    }),
  users: (q: string) =>
    apiRequest<MsgUser[]>(`/msg/recipient-option?q=${encodeURIComponent(q)}`),
};
