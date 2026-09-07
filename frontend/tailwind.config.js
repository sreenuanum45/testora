/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#f4f6fb',
        panel: '#ffffff',
        border: '#e6e9f4',
        ink: '#1a2340',
        muted: '#6b7590',
        brand: {
          50: '#eef1ff',
          100: '#e0e5ff',
          400: '#7c8cf8',
          500: '#5b6bf5',
          600: '#4453e0',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(20, 24, 60, 0.04), 0 8px 24px rgba(20, 24, 60, 0.05)',
      },
    },
  },
  plugins: [],
};
