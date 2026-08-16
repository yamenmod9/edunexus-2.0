/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#0f172a', soft: '#334155', faint: '#64748b' },
        accent: { DEFAULT: '#1d4ed8', hover: '#1e40af', soft: '#dbeafe' },
      },
    },
  },
  plugins: [],
}
