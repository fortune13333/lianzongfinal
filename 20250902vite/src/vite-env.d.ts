// The standard `vite/client` reference is commented out because this app uses `process.env` 
// (polyfilled via Vite's `define` config) instead of `import.meta.env` for environment variables.
// /// <reference types="vite/client" />

// This file provides robust type definitions for the environment variables
// that Vite injects into the client-side code.
declare global {
  // We extend the NodeJS namespace to provide type information for `process.env`.
  // This is a standard way to provide types for environment variables that are
  // polyfilled or replaced by build tools like Vite.
  namespace NodeJS {
    interface ProcessEnv {
      // Defines the environment variables we expect to be available.
      // The actual values are injected by Vite's `define` configuration.
      readonly API_KEY: string;
      readonly VITE_ANALYSIS_API_URL?: string;
      readonly VITE_COMMAND_GENERATION_API_URL?: string;
      readonly VITE_CONFIG_CHECK_API_URL?: string;
    }
  }
}

// By adding `export {}`, we explicitly make this file a module.
// This is a crucial step to prevent the declarations in this file from polluting
// the global scope in a way that might conflict with other type definitions,
// such as the full Node.js types used in `vite.config.ts`.
export {};