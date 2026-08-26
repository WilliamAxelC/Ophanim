/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        serif: ['Cinzel', 'Georgia', 'serif'],
        decorative: ['"Cinzel Decorative"', 'Cinzel', 'serif'],
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        canvas: 'var(--bg-canvas)',
        background: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        surfaceLight: 'var(--bg-surface-elevated)',
        inset: 'var(--bg-inset)',
        border: 'var(--border-subtle)',
        borderStrong: 'var(--border-strong)',
        ink: 'var(--text-primary)',
        sepia: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
        gold: {
          DEFAULT: 'var(--gold-primary)',
          light: 'var(--gold-light)',
          muted: 'var(--gold-muted)',
          border: 'var(--gold-border)',
        },
        lapis: 'var(--accent-lapis)',
        crimson: 'var(--accent-crimson)',
        emerald: 'var(--accent-emerald)',
        terracotta: 'var(--accent-terracotta)',
      },
      boxShadow: {
        warm: 'var(--shadow-warm)',
      }
    },
  },
  plugins: [],
}
