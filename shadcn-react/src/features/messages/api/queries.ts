import { queryOptions } from '@tanstack/react-query';
import { msgApi } from './service';
export const messageKeys = {
  all: ['messages'] as const,
  list: (
    sent: boolean,
    params: Record<string, string | number | boolean>,
    user: number | undefined
  ) => ['messages', 'list', user, sent, params] as const,
  count: () => ['messages', 'count'] as const
};
export const messageListOptions = (
  sent: boolean,
  params: Record<string, string | number | boolean>,
  user: number | undefined
) =>
  queryOptions({
    queryKey: messageKeys.list(sent, params, user),
    queryFn: () => msgApi.list(sent, params),
    staleTime: 0
  });
export const unreadCountOptions = (user: number | undefined) =>
  queryOptions({
    queryKey: [...messageKeys.count(), user],
    queryFn: () => msgApi.count(user),
    staleTime: 0
  });
