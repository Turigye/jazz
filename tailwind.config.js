/** @type {import('tailwindcss').Config} */

// ── Direction A: "Studio" ────────────────────────────────────────────────────
// Jazz is a piece of studio equipment you own, not a service you rent. The
// palette is drawn from 1960s console hardware: warm charcoal housings, brass
// hardware, cream-faced meters lit from behind by a tungsten lamp, and oxide
// red reserved exclusively for overload and failure.
//
// The rule that keeps this from becoming pastiche: exactly ONE skeuomorphic
// object in the whole app (the VU meter in the overlay). Everything else is
// flat, quiet, and modern. No leather, no brushed-metal backgrounds, no
// fake screws.
//
// Semantic token names (surface / on-surface / primary / …) are deliberately
// preserved from the previous Material-derived system so the entire interface
// re-skins from this one file instead of needing a rewrite at every callsite.

module.exports = {
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Brass: the single accent. Active states, CTAs, the needle pivot.
        // Replaces the violet that made the old build look like every other
        // dark-mode app shipped since 2022.
        primary: '#c9a227',
        'primary-fixed': '#e5c158',
        'primary-fixed-dim': '#d4b03f',
        'on-primary': '#1a1408',
        'primary-container': '#4a3a0c',
        'on-primary-container': '#f0dfa8',

        // Named aliases — use these when the intent is the *material*
        // (a brass bezel, a tungsten lamp) rather than the *role* (primary).
        brass: '#c9a227',
        'brass-bright': '#e5c158',
        'brass-dim': '#8a6f1e',
        'brass-edge': '#5a4a20',
        tungsten: '#ffd9a0',
        faceplate: '#2e2a25',
        'faceplate-edge': '#4a4038',
        'meter-face': '#efe4c8',
        oxide: '#c4442f',

        // ── Warm neutrals. Every grey is biased toward the brass, never
        // toward blue — a neutral grey next to brass reads as dirty.
        secondary: '#c6bca8',
        'on-secondary': '#2f2a22',
        'secondary-container': '#453e36',
        'on-secondary-container': '#b4a992',

        // ── Failure. Oxide red, the same red as a meter's overload arc.
        error: '#e4694f',
        'on-error': '#3a0d05',
        'error-container': '#6e2418',
        'on-error-container': '#ffd9cf',

        // ── Surfaces: a warm charcoal tonal ladder, deepest to brightest.
        background: '#1a1815',
        'on-background': '#ede6da',
        surface: '#1a1815',
        'on-surface': '#ede6da',
        'surface-variant': '#2a2622',
        'on-surface-variant': '#a79c8a',
        'surface-container-lowest': '#121110',
        'surface-container-low': '#1c1a16',
        'surface-container': '#221f1b',
        'surface-container-high': '#2a2622',
        'surface-container-highest': '#332e28',
        'surface-dim': '#141210',
        'surface-bright': '#3a342c',
        'surface-tint': '#c9a227',

        outline: '#7a6e5e',
        'outline-variant': '#3a342c',

        // Type tones, named for what they are rather than what they sit on.
        cream: '#ede6da',
        'cream-dim': '#a79c8a',
        'cream-faint': '#6e655a'
      },

      fontFamily: {
        // Archivo carries a 62–125% width axis, so the same family provides
        // both the condensed nav lettering and the expanded display sizes.
        sans: ['Archivo Variable', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['Archivo Variable', 'system-ui', 'sans-serif'],
        // Every measured value — levels, timecodes, model names, key chords.
        mono: ['JetBrains Mono Variable', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace']
      },

      fontSize: {
        'headline-lg': ['44px', { lineHeight: '1.05', letterSpacing: '-0.02em', fontWeight: '600' }],
        'headline-md': ['26px', { lineHeight: '1.2',  letterSpacing: '-0.01em', fontWeight: '500' }],
        'headline-sm': ['19px', { lineHeight: '1.25', letterSpacing: '-0.005em', fontWeight: '600' }],
        'body-lg':     ['17px', { lineHeight: '1.55', fontWeight: '400' }],
        'body-md':     ['15px', { lineHeight: '1.55', fontWeight: '400' }],
        'label-md':    ['13px', { lineHeight: '1.4',  letterSpacing: '0.01em', fontWeight: '500' }],
        'label-sm':    ['11px', { lineHeight: '1.3',  letterSpacing: '0.04em', fontWeight: '500' }],
        // Engraved-plate lettering: uppercase, wide-tracked, small. Used for
        // nav items and the secondary line under each setting.
        'plate':       ['10.5px', { lineHeight: '1.35', letterSpacing: '0.14em', fontWeight: '500' }],
        'plate-lg':    ['12px', { lineHeight: '1.3',  letterSpacing: '0.16em', fontWeight: '500' }]
      },

      borderRadius: {
        // Hardware has tight corners. The old 0.5–1rem radii read as web-app;
        // 2–4px reads as a machined panel.
        DEFAULT: '3px',
        lg: '4px',
        xl: '5px',
        '2xl': '6px'
      },

      animation: {
        'fade-in': 'fadeIn 0.18s ease-out',
        'fade-out': 'fadeOut 0.18s ease-in forwards',
        // The tungsten lamp behind the meter face doesn't blink — it breathes,
        // the way a filament settles at temperature.
        'lamp': 'lamp 4s ease-in-out infinite'
      },

      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        fadeOut: {
          '0%': { opacity: '1', transform: 'scale(1)' },
          '100%': { opacity: '0', transform: 'scale(0.98)' }
        },
        lamp: {
          '0%, 100%': { opacity: '0.88' },
          '50%': { opacity: '1' }
        }
      },

      boxShadow: {
        // Warm lamp bloom, not a neon halo.
        glow: '0 0 24px rgba(255,217,160,0.13)',
        'glow-strong': '0 0 28px rgba(255,217,160,0.28)',
        // A floating panel sitting on a desk.
        orb: '0 6px 22px rgba(0,0,0,0.58), 0 1px 0 rgba(255,220,180,0.07) inset',
        // Machined bezel: dark ambient plus a lit top edge.
        plate: '0 5px 18px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,220,180,0.10)'
      },

      backdropBlur: {
        glass: '24px',
        overlay: '64px'
      }
    }
  },
  plugins: []
}
