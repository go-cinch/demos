import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxyTarget = env.AUTH_PROXY_TARGET;

  return {
    server: {
      host: "0.0.0.0",
      port: Number(env.VITE_PORT || 5173),
      proxy: proxyTarget
        ? {
            "/api/auth": {
              target: proxyTarget,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api\/auth/, ""),
            },
          }
        : undefined,
    },
    resolve: {
      alias: {
        "@": "/src",
      },
    },
    plugins: [
      react(),
      svgr({
        svgrOptions: {
          icon: true,
          // This will transform your SVG to a React component
          exportType: "named",
          namedExport: "ReactComponent",
        },
      }),
    ],
    build: {
      rolldownOptions: {
        onwarn(warning, warn) {
          // Skip eval warnings from react-jvectormap
          if (
            warning.code === "EVAL" &&
            warning.id?.includes("@react-jvectormap")
          ) {
            return;
          }
          warn(warning);
        },
      },
    },
  };
});
