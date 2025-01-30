/* eslint-disable unicorn/prefer-module */
import { createGlobPatternsForDependencies } from '@nx/react/tailwind';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    path.join(__dirname, '{src,pages,components,app}/**/*!(*.stories|*.spec).{ts,tsx,html}'),
    ...createGlobPatternsForDependencies(__dirname),
  ],
  theme: {
    boxShadow: {
      xs: '0px 1px 2px 0px rgba(10, 13, 20, 0.03)',
      sm: '0px 1px 2px 0px #1018280F,0px 1px 3px 0px #1018281A',
      md: '0px 16px 32px -12px rgba(14, 18, 27, 0.10)',
      DEFAULT: '0px 16px 32px -12px #0E121B1A',
    },
    colors: {
      black: 'black',
      white: 'white',
      transparent: 'transparent',
      background: 'hsl(var(--background))',
      foreground: {
        0: 'hsl(var(--foreground-0))',
        50: 'hsl(var(--foreground-50))',
        100: 'hsl(var(--foreground-100))',
        200: 'hsl(var(--foreground-200))',
        300: 'hsl(var(--foreground-300))',
        400: 'hsl(var(--foreground-400))',
        500: 'hsl(var(--foreground-500))',
        600: 'hsl(var(--foreground-600))',
        700: 'hsl(var(--foreground-700))',
        800: 'hsl(var(--foreground-800))',
        900: 'hsl(var(--foreground-900))',
        950: 'hsl(var(--foreground-950))',
        DEFAULT: 'hsl(var(--foreground))',
      },
      neutral: {
        0: 'hsl(var(--neutral-0))',
        50: 'hsl(var(--neutral-50))',
        100: 'hsl(var(--neutral-100))',
        200: 'hsl(var(--neutral-200))',
        300: 'hsl(var(--neutral-300))',
        400: 'hsl(var(--neutral-400))',
        500: 'hsl(var(--neutral-500))',
        600: 'hsl(var(--neutral-600))',
        700: 'hsl(var(--neutral-700))',
        800: 'hsl(var(--neutral-800))',
        900: 'hsl(var(--neutral-900))',
        950: 'hsl(var(--neutral-950))',
        DEFAULT: 'hsl(var(--neutral))',
        foreground: 'hsl(var(--neutral-foreground))',
      },
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))',
      },
      accent: {
        DEFAULT: 'hsl(var(--accent))',
      },
      border: {
        DEFAULT: 'hsl(var(--border))',
      },
      destructive: {
        DEFAULT: 'hsl(var(--destructive))',
        foreground: 'hsl(var(--destructive-foreground))',
      },
      muted: {
        DEFAULT: 'hsl(var(--muted))',
        foreground: 'hsl(var(--muted-foreground))',
      },
      success: {
        DEFAULT: 'hsl(var(--success))',
      },
      warning: {
        DEFAULT: 'hsl(var(--warning))',
      },
      feature: {
        DEFAULT: 'hsl(var(--feature))',
      },
      information: {
        DEFAULT: 'hsl(var(--information))',
      },
      highlighted: {
        DEFAULT: 'hsl(var(--highlighted))',
      },
      stable: {
        DEFAULT: 'hsl(var(--stable))',
      },
      verified: {
        DEFAULT: 'hsl(var(--verified))',
      },
      alert: {
        DEFAULT: 'hsl(var(--alert))',
      },
      input: 'hsl(var(--input))',
      ring: 'hsl(var(--ring))',
      sidebar: {
        DEFAULT: 'hsl(var(--sidebar-background))',
        foreground: 'hsl(var(--sidebar-foreground))',
        primary: 'hsl(var(--sidebar-primary))',
        'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
        accent: 'hsl(var(--sidebar-accent))',
        'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
        border: 'hsl(var(--sidebar-border))',
        ring: 'hsl(var(--sidebar-ring))',
      },
      card: {
        DEFAULT: 'hsl(var(--card))',
        foreground: 'hsl(var(--card-foreground))',
      },
      popover: {
        DEFAULT: 'hsl(var(--popover))',
        foreground: 'hsl(var(--popover-foreground))',
      },
    },
    fontSize: {
      '2xs': ['0.625rem', '0.875rem'],
      xs: ['0.75rem', '1rem'],
      sm: ['0.875rem', '1.25rem'],
      base: ['1rem', '1.5rem'],
      lg: ['1.125rem', '1.75rem'],
      xl: ['1.25rem', '1.75rem'],
      '2xl': ['1.5rem', '2rem'],
      '3xl': ['1.875rem', '2.25rem'],
      '4xl': ['2.25rem', '2.5rem'],
      '5xl': ['3rem', '1'],
      '6xl': ['3.75rem', '1'],
      '7xl': ['4.5rem', '1'],
      '8xl': ['6rem', '1'],
      '9xl': ['8rem', '1'],
    },
    extend: {
      fontFamily: {
        code: ['Ubuntu', 'monospace'],
      },
      opacity: {
        2.5: 0.025,
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        gradient: {
          '0%, 100%': {
            backgroundPosition: '0% 50%',
          },
          '50%': {
            backgroundPosition: '100% 50%',
          },
        },
        'pulse-subtle': {
          '0%, 100%': {
            opacity: '1',
          },
          '50%': {
            opacity: '0.85',
          },
        },
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        gradient: 'gradient 5s ease infinite',
      },
    },
  },

  plugins: [
    require('tailwindcss-animate'),
    require('@tailwindcss/typography'),
    require('tailwind-scrollbar')({ nocompatible: true }),
  ],
};
