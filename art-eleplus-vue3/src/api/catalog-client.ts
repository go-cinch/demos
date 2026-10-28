import { authClient } from './auth-service'
/** Catalog APIs share the Auth service's session, language and error handling. */
export const authRequestClient = {
  get: async <T>(path: string, config?: any): Promise<T> =>
    (await authClient.get<T>(path, config)).data,
  post: async <T>(path: string, data?: any, config?: any): Promise<T> =>
    (await authClient.post<T>(path, data, config)).data,
  request: async <T>(path: string, config: any): Promise<T> =>
    (await authClient.request<T>({ url: path, ...config })).data,
  delete: async <T>(path: string): Promise<T> => (await authClient.delete<T>(path)).data
}
