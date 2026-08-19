import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const configuredAuthUrl = env.VITE_NEON_AUTH_URL?.trim();
  let authProxy: Record<string, unknown> | undefined;
  if (command === "serve" && configuredAuthUrl) {
    const upstream = new URL(configuredAuthUrl);
    if (upstream.protocol !== "https:") throw new Error("VITE_NEON_AUTH_URL must use HTTPS.");
    const upstreamPath = upstream.pathname.replace(/\/$/, "");
    authProxy = {
      target: upstream.origin,
      changeOrigin: true,
      secure: true,
      cookieDomainRewrite: "",
      cookiePathRewrite: "/neon-auth",
      rewrite: (path: string) => `${upstreamPath}${path.replace(/^\/neon-auth/, "")}`,
      configure(proxy) {
        proxy.on("proxyReq", (proxyRequest, request) => {
          // Neon Auth validates the browser origin. http-proxy can rewrite it
          // when changeOrigin is enabled, so preserve the trusted local origin.
          if (request.headers.origin) proxyRequest.setHeader("origin", request.headers.origin);
          if (request.headers.referer) proxyRequest.setHeader("referer", request.headers.referer);
        });
      },
    };
  }
  return {
  test: { include: ["src/**/*.test.{ts,tsx}"] },
  server: { proxy: authProxy ? { "/neon-auth": authProxy } : undefined },
  build: {
    rolldownOptions: {
      output: {
          manualChunks(id) {
            if (id.includes("@neondatabase/neon-js")) return "neon-auth";
            if (id.includes("@fluentui") || id.includes("@griffel") || id.includes("tabster") || id.includes("keyborg")) return "fluent-vendor";
            if (id.includes("node_modules/react") || id.includes("node_modules\\react")) return "react-vendor";
        },
      },
    },
  },
  };
});
