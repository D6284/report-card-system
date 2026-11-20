/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Arial', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        xs: '0 1px 2px 0 rgb(15 23 42 / 0.05)',
        soft: '0 12px 32px -14px rgb(15 23 42 / 0.18), 0 3px 8px -3px rgb(15 23 42 / 0.07)',
      },
    },
  },
  plugins: [],
};
