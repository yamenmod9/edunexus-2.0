/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],

  // Dark mode is a class on <html>, set before first paint by the inline
  // script in index.html. See src/index.css for the two palettes.
  darkMode: 'class',

  theme: {
    extend: {
      colors: {
        // Every colour resolves through a CSS variable, so switching theme
        // swaps the variables rather than requiring a `dark:` variant on each
        // of the ~100 colour usages in the app.
        page: 'var(--c-page)',
        surface: 'var(--c-surface)',
        sunken: 'var(--c-sunken)',
        line: { DEFAULT: 'var(--c-line)', strong: 'var(--c-line-strong)' },
        ink: {
          DEFAULT: 'var(--c-ink)',
          soft: 'var(--c-ink-soft)',
          faint: 'var(--c-ink-faint)',
        },
        accent: {
          DEFAULT: 'var(--c-accent)',
          hover: 'var(--c-accent-hover)',
          soft: 'var(--c-accent-soft)',
          on: 'var(--c-on-accent)',
        },
        good: { DEFAULT: 'var(--c-good)', soft: 'var(--c-good-soft)' },
        bad: { DEFAULT: 'var(--c-bad)', soft: 'var(--c-bad-soft)' },
        flag: { DEFAULT: 'var(--c-flag)', soft: 'var(--c-flag-soft)' },
      },
      fontFamily: {
        // Serif carries anything a student reads — titles, passages, stems,
        // score numerals. Sans carries anything they operate.
        serif: ['Georgia', 'Iowan Old Style', 'Palatino', 'serif'],
      },
    },
  },
  plugins: [],
}
