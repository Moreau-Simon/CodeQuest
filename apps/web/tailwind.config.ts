import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: 'rgb(var(--cq-surface) / <alpha-value>)',
        elevated: 'rgb(var(--cq-elevated) / <alpha-value>)',
        ink: 'rgb(var(--cq-ink) / <alpha-value>)',
        muted: 'rgb(var(--cq-muted) / <alpha-value>)',
        primary: 'rgb(var(--cq-primary) / <alpha-value>)',
        accent: 'rgb(var(--cq-accent) / <alpha-value>)',
        danger: 'rgb(var(--cq-danger) / <alpha-value>)',
        success: 'rgb(var(--cq-success) / <alpha-value>)',
        warning: 'rgb(var(--cq-warning) / <alpha-value>)',
        border: 'rgb(var(--cq-border) / <alpha-value>)',
        line: 'rgb(var(--cq-line) / <alpha-value>)'
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace']
      },
      borderRadius: {
        xl: '0.875rem'
      }
    }
  },
  plugins: []
} satisfies Config;
