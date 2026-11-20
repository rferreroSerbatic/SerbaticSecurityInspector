/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#06060b',
        panel: '#0a0a14',
        neon: { cyan: '#00e5ff', magenta: '#ff2d95' },
        sev: { critical: '#ff2d95', high: '#ff9f43', medium: '#ffd23f', low: '#00e5ff' },
        ink: { DEFAULT: '#f4f4f8', dim: '#8b8b98', faint: '#5a5a68' },
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['Consolas', '"Cascadia Code"', 'monospace'],
      },
    },
  },
  plugins: [],
}
