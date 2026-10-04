import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    cacheDir: 'node_modules/.vite-ant-design-mobile',
    server: {
      headers: { 'Cache-Control': 'no-store' },
      allowedHosts: ['preview-local.go-cinch.top'],
      port: Number(env.VITE_PORT || 5671),
      strictPort: true,
      proxy: env.AUTH_PROXY_TARGET
        ? {
            '/api/auth': {
              target: env.AUTH_PROXY_TARGET,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api\/auth(?=\/|$)/, ''),
            },
          }
        : undefined,
    },
    build: { target: 'es2022' },
  };
});
