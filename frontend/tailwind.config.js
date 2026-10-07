import frappeUIPreset from 'frappe-ui/tailwind'

export default {
  presets: [frappeUIPreset],
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
    './node_modules/frappe-ui/src/**/*.{vue,js,ts,jsx,tsx}',
    '../node_modules/frappe-ui/src/**/*.{vue,js,ts,jsx,tsx}',
    './node_modules/frappe-ui/frappe/**/*.{vue,js,ts,jsx,tsx}',
    '../node_modules/frappe-ui/frappe/**/*.{vue,js,ts,jsx,tsx}',
    // linked @framework/ui source (apps/frappe/ui/src) — scan so its utility and
    // arbitrary-variant classes (e.g. Notifications TabButtons overrides) are generated
    '../../frappe/ui/src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  safelist: [{ pattern: /!(text|bg)-/, variants: ['hover', 'active'] }],
  theme: {
    extend: {
      fontFamily: {
        // Books design language: Inter as the primary UI font (dense, feature-rich).
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        // Dark navy sidebar surfaces. The sidebar itself is painted from the
        // `--nav-*` tokens in styles/design-system.css, which are canonical;
        // these utilities reference the same variables so the Tailwind scale
        // and the sidebar can never drift apart. (Previously this ramp held
        // its own five hexes, none of which matched what the sidebar actually
        // rendered, and no component used it.)
        navy: {
          950: 'var(--nav-edge)',
          900: 'var(--nav-bg-brand)',
          850: 'var(--nav-bg)',
          800: 'var(--nav-bg-raised)',
          700: 'var(--nav-bg-hover)',
        },
        // Single accent — Books token blue #2563eb. Keeping the `brand` name
        // re-skins every existing `brand-500/600` usage in one edit.
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#172554',
        },
        // Re-base the raw `blue-*` palette to the Books ramp so frappe-ui's
        // blue-themed utilities (bg-blue-500, text-blue-600, ...) match the accent.
        blue: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#172554',
        },
      },
      boxShadow: {
        // Books three-tier elevation scale (books.css --shadow-*).
        'ambient-sm': '0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.05)',
        'ambient-md': '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
        'ambient-lg': '0 10px 30px rgba(0, 0, 0, 0.1)',
        'glow-blue': '0 0 20px -2px rgba(37, 99, 235, 0.35)',
        'glow-emerald': '0 0 20px -2px rgba(16, 185, 129, 0.35)',
        'glow-amber': '0 0 20px -2px rgba(245, 158, 11, 0.35)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'subtle-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        'subtle-pulse': 'subtle-pulse 3s infinite ease-in-out',
      },
    },
  },
  plugins: [],
}
