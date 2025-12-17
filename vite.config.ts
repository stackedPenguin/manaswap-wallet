import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import manifest from './src/manifest';

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    nodePolyfills({
      include: ['buffer', 'crypto', 'stream', 'util'],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: 'src/pages/popup/index.html',
        inject: 'src/provider/inject.ts',
      },
      output: {
        entryFileNames: 'assets/[name].js',
      },
    },
  },
});
