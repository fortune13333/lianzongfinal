/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        blob: "blob 10s infinite",
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        blob: {
          "0%": {
            transform: "translate(0px, 0px) scale(1)",
          },
          "33%": {
            transform: "translate(30px, -50px) scale(1.1)",
          },
          "66%": {
            transform: "translate(-20px, 20px) scale(0.9)",
          },
          "100%": {
            transform: "translate(0px, 0px) scale(1)",
          },
        },
      },
      colors: {
        primary: {
          200: 'rgb(var(--color-primary-200) / <alpha-value>)',
          300: 'rgb(var(--color-primary-300) / <alpha-value>)',
          400: 'rgb(var(--color-primary-400) / <alpha-value>)',
          500: 'rgb(var(--color-primary-500) / <alpha-value>)',
          600: 'rgb(var(--color-primary-600) / <alpha-value>)',
          700: 'rgb(var(--color-primary-700) / <alpha-value>)',
        },
        bg: {
          50: "rgb(var(--color-bg-50) / <alpha-value>)",
          100: "rgb(var(--color-bg-100) / <alpha-value>)",
          200: "rgb(var(--color-bg-200) / <alpha-value>)",
          300: "rgb(var(--color-bg-300) / <alpha-value>)",
          400: "rgb(var(--color-bg-400) / <alpha-value>)",
          500: "rgb(var(--color-bg-500) / <alpha-value>)",
          600: "rgb(var(--color-bg-600) / <alpha-value>)",
          700: "rgb(var(--color-bg-700) / <alpha-value>)",
          800: "rgb(var(--color-bg-800) / <alpha-value>)",
          900: "rgb(var(--color-bg-900) / <alpha-value>)",
          950: "rgb(var(--color-bg-950) / <alpha-value>)"
        },
        text: {
          100: "rgb(var(--color-text-100) / <alpha-value>)",
          200: "rgb(var(--color-text-200) / <alpha-value>)",
          300: "rgb(var(--color-text-300) / <alpha-value>)",
          400: "rgb(var(--color-text-400) / <alpha-value>)",
          500: "rgb(var(--color-text-500) / <alpha-value>)",
        }
      }
    }
  },
  plugins: [],
}