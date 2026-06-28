/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Overseer brand palette — a calm "night-ops" teal/indigo.
        ink: {
          950: "#0a0e14",
          900: "#0f141c",
          850: "#141a24",
          800: "#1a2230",
          700: "#26303f",
          600: "#374252",
        },
        brand: {
          50: "#ecfeff",
          200: "#a5f3fc",
          400: "#34d3e0",
          500: "#16b8c8",
          600: "#0e96a6",
          700: "#117585",
        },
        accent: {
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(22,184,200,0.15), 0 8px 30px rgba(0,0,0,0.35)",
      },
    },
  },
  plugins: [],
};
