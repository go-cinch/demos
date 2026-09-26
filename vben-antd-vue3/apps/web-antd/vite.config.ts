import { defineConfig } from '@vben/vite-config';

import { loadEnv } from 'vite';

export default defineConfig(async ({ mode }) => {
  const { AUTH_PROXY_TARGET } = loadEnv(mode, process.cwd(), '');
  return {
    application: { nitroMock: false },
    vite: {
      server: {
        proxy: {
          ...(AUTH_PROXY_TARGET
            ? {
                '/api/auth': {
                  changeOrigin: true,
                  rewrite: (path: string) =>
                    path.replace(/^\/api\/auth(?=\/|$)/, ''),
                  target: AUTH_PROXY_TARGET,
                },
              }
            : {}),
        },
      },
    },
  };
});
