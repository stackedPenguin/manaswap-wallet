import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

// Dev-only config for testing the popup UI in a browser without extension APIs
export default defineConfig({
    plugins: [
        react(),
        nodePolyfills({
            include: ['buffer', 'crypto', 'stream', 'util', 'vm', 'fs', 'os', 'path'],
            globals: {
                Buffer: true,
                global: true,
                process: true,
            },
        }),
    ],
    resolve: {
        alias: {
            stream: 'stream-browserify',
            crypto: 'crypto-browserify',
        },
        dedupe: ['@solana/web3.js', 'bn.js', 'buffer'],
    },
    server: {
        port: 3000,
    },
});
