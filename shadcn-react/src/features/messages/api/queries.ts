import { queryOptions } from '@tanstack/react-query';
import { msgApi } from './service';
export const messageKeys = {
  all: ['messages'] as const,
  list: (sent: boolean, params: Record<string, string | number | boolean>) =>
    ['messages', 'list', sent, params] as const,
  count: () => ['messages', 'count'] as const
};
export const messageListOptions = (
  sent: boolean,
  params: Record<string, string | number | boolean>
) =>
  queryOptions({
    queryKey: messageKeys.list(sent, params),
    queryFn: () => msgApi.list(sent, params),
    staleTime: 0
  });
export const unreadCountOptions = () =>
  queryOptions({
    queryKey: messageKeys.count(),
    queryFn: msgApi.count,
    staleTime: 0
  });
