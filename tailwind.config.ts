import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#050609",
          900: "#0a0c12",
          850: "#0f121a",
          800: "#151925",
          700: "#1d2231",
          600: "#2a3145",
        },
        seal: {
          // Sealed / encrypted state.
          400: "#7c8cff",
          500: "#5b6cf0",
          600: "#4553d4",
        },
        clear: {
          // Decrypted / plaintext state.
          400: "#3fd9c0",
          500: "#22c3a8",
        },
        warn: {
          400: "#f6a94a",
          500: "#e08a20",
        },
        breach: {
          400: "#ff6b81",
          500: "#e8455f",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Inter", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "JetBrains Mono", "monospace"],
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        shimmer: "shimmer 2.2s linear infinite",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
    },
  },
  plugins: [],
}

export default config
