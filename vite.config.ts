import path from 'node:path';
import devServer from '@hono/vite-dev-server';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'charts-vendor': ['recharts'],
          'react-vendor': ['react', 'react-dom'],
          'tanstack-vendor': [
            '@tanstack/react-query',
            '@tanstack/react-router',
            '@tanstack/react-table',
          ],
        },
      },
    },
  },
  plugins: [
    tailwindcss(),
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react(),
    devServer({
      entry: 'api/app.ts',
      // Forward only /api requests to Hono. Let Vite handle SPA routes and assets.
      exclude: [/^\/(?!api(?:\/|$)).*/],
      injectClientScript: false,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@api': path.resolve(__dirname, './api'),
    },
  },
  server: {
    port: 5173,
  },
});
