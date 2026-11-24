import type { Plugin } from 'vite';

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';

import { defineConfig } from '@vben/vite-config';

import { loadEnv } from 'vite';

const previewHost = `preview-local.go-cinch.top`;

function localAuthFaults(directory: string): Plugin {
  return {
    name: 'local-auth-faults',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split('?', 1)[0];
        if (path?.startsWith('/api/auth/')) {
          const rule = `${request.method} ${path}`;
          const marker = createHash('sha256').update(rule).digest('hex');
          if (existsSync(join(directory, marker))) {
            response.writeHead(502, { 'Cache-Control': 'no-store' });
            response.end('Paused by local-debug.sh');
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig(async ({ mode }) => {
  const { AUTH_PROXY_TARGET, LOCAL_DEBUG_AUTH_FAULTS_DIR } = loadEnv(
    mode,
    process.cwd(),
    '',
  );
  return {
    application: { nitroMock: false },
    vite: {
      plugins:
        AUTH_PROXY_TARGET && LOCAL_DEBUG_AUTH_FAULTS_DIR
          ? [localAuthFaults(LOCAL_DEBUG_AUTH_FAULTS_DIR)]
          : [],
      server: {
        allowedHosts: [previewHost],
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
