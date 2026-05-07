import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  return {
    base: './',
    plugins: [
      react(),
      {
        name: "tv-strip-crossorigin",
        transformIndexHtml: {
          order: "post",
          handler(html) {
            // Some webOS engines in packaged file:// mode fail stylesheet/script
            // loads when crossorigin is present even for same-origin files.
            return html.replace(/\s+crossorigin(?:=("|').*?\1)?/g, "");
          },
        },
      },
    ],
    define: {
      "process.env.GEMINI_API_KEY": JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "."),
      },
    },
    build: {
      // Target ES2017 for broad Smart TV WebView compatibility (WebOS 4+, Tizen 4+)
      target: "es2017",
      rollupOptions: {
        output: {
          assetFileNames: (assetInfo) => {
            if ((assetInfo.name || "").endsWith(".css")) {
              return "assets/index.css";
            }
            return "assets/[name]-[hash][extname]";
          },
          // Split heavy libraries into separate chunks for better caching
          manualChunks: {
            "vendor-player": ["hls.js", "mpegts.js"],
            "vendor-ui": ["motion/react", "sonner", "lucide-react"],
          },
        },
      },
      // Reduce chunk size warnings
      chunkSizeWarningLimit: 600,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== "true",
      watch: {
        // Ignore the server-side API cache file — it's written by server.ts while
        // the app is running, and Vite would otherwise trigger a full page reload.
        ignored: ["**/.nova-api-cache.json"],
      },
    },
  };
});
