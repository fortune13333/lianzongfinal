import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import process from 'node:process';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.VITE_AI_DRIVER': JSON.stringify(env.VITE_AI_DRIVER),
      'process.env.VITE_ANALYSIS_API_URL': JSON.stringify(env.VITE_ANALYSIS_API_URL),
      'process.env.VITE_COMMAND_GENERATION_API_URL': JSON.stringify(env.VITE_COMMAND_GENERATION_API_URL),
      'process.env.VITE_CONFIG_CHECK_API_URL': JSON.stringify(env.VITE_CONFIG_CHECK_API_URL),
    },
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), './src'),
      },
    },
    test: {
      // Use jsdom to simulate browser environment (sessionStorage, window, etc.)
      environment: 'jsdom',
      globals: true,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html'],
        include: ['src/utils/**', 'src/store/**'],
      },
    },
  };
});
