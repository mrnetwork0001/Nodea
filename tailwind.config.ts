import type { Config } from "tailwindcss"

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /** Near-black ground and the surfaces that sit on it. */
        void: {
          DEFAULT: "#000000",
          950: "#050505",
          900: "#0A0A0A",
          850: "#0F0F0F",
          800: "#141414",
          700: "#1C1C1C",
          600: "#262626",
          500: "#333333",
        },
        /** The single accent. Used for emphasis, never for body text on dark. */
        acid: {
          DEFAULT: "#CDFF00",
          400: "#DBFF4D",
          500: "#CDFF00",
          600: "#A6CF00",
        },
        /** Decrypted / verified state. */
        live: "#CDFF00",
        /** Breach / exposed state. */
        alert: "#FF4D4D",
      },
      fontFamily: {
        sans: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.045em",
        tighter: "-0.03em",
        label: "0.18em",
      },
      animation: {
        marquee: "marquee 34s linear infinite",
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
}

export default config
