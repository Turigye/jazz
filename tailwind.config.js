/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Refined Monochrome Hybrid ──────────────────────────────────────
        // Violet accent — used only for active/recording/recommended/CTA.
        primary: '#c44af0',
        'primary-fixed': '#e0a6f8',
        'primary-fixed-dim': '#d27bf4',
        'on-primary': '#ffffff',
        'primary-container': '#4a0066',
        'on-primary-container': '#f1d4fb',

        // Secondary monochrome silvers (used in sidebar inactive nav, hint text).
        secondary: '#c6c6cf',
        'on-secondary': '#2f3037',
        'secondary-container': '#45464e',
        'on-secondary-container': '#b4b4bd',

        // Error.
        error: '#ffb4ab',
        'on-error': '#690005',
        'error-container': '#93000a',
        'on-error-container': '#ffdad6',

        // Surfaces — strictly monochrome tonal ladder.
        background: '#141313',
        'on-background': '#e5e2e1',
        surface: '#141313',
        'on-surface': '#e5e2e1',
        'surface-variant': '#353434',
        'on-surface-variant': '#c4c7c8',
        'surface-container-lowest': '#0e0e0e',
        'surface-container-low': '#1c1b1b',
        'surface-container': '#201f1f',
        'surface-container-high': '#2a2a2a',
        'surface-container-highest': '#353434',
        'surface-dim': '#141313',
        'surface-bright': '#3a3939',
        'surface-tint': '#c44af0',

        outline: '#8e9192',
        'outline-variant': '#444748',

        // Legacy jazz palette — kept for any unmigrated callsites.
        // Will remove once everything is migrated to the new tokens.
        jazz: {
          50:  '#fdf4ff',
          100: '#fae8ff',
          200: '#f3d0fe',
          300: '#e9a8fd',
          400: '#d872f8',
          500: '#c44af0',
          600: '#a927d6',
          700: '#8e1db0',
          800: '#751c8f',
          900: '#611b73',
          950: '#420350'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif']
      },
      fontSize: {
        'headline-lg': ['48px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '500' }],
        'headline-sm': ['20px', { lineHeight: '1.3', letterSpacing: '-0.01em', fontWeight: '600' }],
        'body-lg':     ['18px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-md':     ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        'label-md':    ['14px', { lineHeight: '1.4', letterSpacing: '0.01em', fontWeight: '500' }],
        'label-sm':    ['12px', { lineHeight: '1.2', fontWeight: '600' }]
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem'
      },
      animation: {
        'pulse-fast': 'pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in': 'fadeIn 0.18s ease-out',
        'fade-out': 'fadeOut 0.18s ease-in forwards',
        'wave-1': 'waveform 1s ease-in-out 0.1s infinite',
        'wave-2': 'waveform 1s ease-in-out 0.3s infinite',
        'wave-3': 'waveform 1s ease-in-out 0.5s infinite',
        'wave-4': 'waveform 1s ease-in-out 0.2s infinite',
        'wave-5': 'waveform 1s ease-in-out 0.4s infinite'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        fadeOut: {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.96)' }
        },
        waveform: {
          '0%, 100%': { height: '4px' },
          '50%': { height: '16px' }
        }
      },
      boxShadow: {
        // Violet glow used on recording/recommended states
        glow: '0 0 30px rgba(196,74,240,0.15)',
        'glow-strong': '0 0 30px rgba(196,74,240,0.35)',
        // Heavy ambient shadow under floating panels
        orb: '0 4px 32px rgba(0,0,0,0.5)'
      },
      backdropBlur: {
        glass: '24px',
        overlay: '64px'
      }
    }
  },
  plugins: []
}
