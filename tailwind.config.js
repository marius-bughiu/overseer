/** @type {import('tailwindcss').Config} */

// Colors are backed by CSS variables (defined in src/index.css) so the whole
// palette can be swapped between dark and light by toggling a class on <html>.
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // "Surfaces" — darkest→lightest in dark mode; inverted in light mode.
        ink: {
          950: v("--ink-950"),
          900: v("--ink-900"),
          850: v("--ink-850"),
          800: v("--ink-800"),
          700: v("--ink-700"),
          600: v("--ink-600"),
        },
        // Text / borders — overrides Tailwind's slate for the shades we use.
        slate: {
          100: v("--slate-100"),
          200: v("--slate-200"),
          300: v("--slate-300"),
          400: v("--slate-400"),
          500: v("--slate-500"),
          600: v("--slate-600"),
        },
        brand: {
          200: v("--brand-200"),
          400: v("--brand-400"),
          500: v("--brand-500"),
          600: v("--brand-600"),
          700: v("--brand-700"),
        },
        accent: {
          400: v("--accent-400"),
          500: v("--accent-500"),
          600: v("--accent-600"),
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
