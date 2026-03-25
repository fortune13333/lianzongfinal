import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
// FIX: Import `process` from `node:process` to provide the correct types for `process.cwd()` and resolve TypeScript errors.
import process from 'node:process';
// FIX: The `cwd` named export from 'node:process' is not available in all environments.
// Using the global `process.cwd()` is a more robust method.
// import { cwd } from 'node:process';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Use process.cwd() from the global process object to get the current working directory.
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    define: {
      // Expose environment variables to the client
      'process.env.API_KEY': JSON.stringify(env.API_KEY),
      'process.env.VITE_AI_DRIVER': JSON.stringify(env.VITE_AI_DRIVER),
      'process.env.VITE_ANALYSIS_API_URL': JSON.stringify(env.VITE_ANALYSIS_API_URL),
      'process.env.VITE_COMMAND_GENERATION_API_URL': JSON.stringify(env.VITE_COMMAND_GENERATION_API_URL),
      'process.env.VITE_CONFIG_CHECK_API_URL': JSON.stringify(env.VITE_CONFIG_CHECK_API_URL),
    },
    resolve: {
      alias: {
        // Use process.cwd() to resolve the path in an ES module context.
        '@': path.resolve(process.cwd(), './src'),
      },
    },
  };
});
