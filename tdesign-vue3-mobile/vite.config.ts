import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [vue()],
    // Isolated UI previews must not overwrite the live server's optimized dependencies.
    cacheDir: 'node_modules/.vite-tdesign-mobile',
    server: {
      headers: { 'Cache-Control': 'no-store' },
      allowedHosts: ['preview-local.go-cinch.top'],
      port: Number(env.VITE_PORT || 5670),
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
