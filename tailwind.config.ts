// tailwind.config.ts
import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          black:       '#0D0D0D',
          dark:        '#141414',
          card:        '#1A1A1A',
          border:      '#2A2A2A',
          accent:      '#8B2E2E',
          accentLight: '#B03A3A',
          text:        '#E8E4DC',
          muted:       '#7A7068',
        },
      },
      fontFamily: {
        display: ['var(--font-cormorant)', 'Cormorant Garamond', 'serif'],
        sans:    ['var(--font-inter)', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
