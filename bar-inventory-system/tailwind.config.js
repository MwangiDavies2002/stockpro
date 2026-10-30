/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx,js,jsx}',
    './pages/**/*.{ts,tsx,js,jsx}',
    './components/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        gray: {50:'#eeece4',100:'#e5e2d8',200:'#d3d0c5',300:'#bbb8ac',400:'#85877c',500:'#666d61',600:'#535c50',700:'#424b40',800:'#333c32',900:'#292e29',950:'#232823'},
        slate: {50:'#eeece4',100:'#e5e2d8',200:'#d3d0c5',300:'#bbb8ac',400:'#85877c',500:'#666d61',600:'#535c50',700:'#424b40',800:'#333c32',900:'#292e29',950:'#232823'},
        zinc: {50:'#eeece4',100:'#e5e2d8',200:'#d3d0c5',300:'#bbb8ac',400:'#85877c',500:'#666d61',600:'#535c50',700:'#424b40',800:'#333c32',900:'#292e29',950:'#232823'},
        neutral: {50:'#eeece4',100:'#e5e2d8',200:'#d3d0c5',300:'#bbb8ac',400:'#85877c',500:'#666d61',600:'#535c50',700:'#424b40',800:'#333c32',900:'#292e29',950:'#232823'},
        stone: {50:'#eeece4',100:'#e5e2d8',200:'#d3d0c5',300:'#bbb8ac',400:'#85877c',500:'#666d61',600:'#535c50',700:'#424b40',800:'#333c32',900:'#292e29',950:'#232823'},
        amber: {50:'#f3ece0',100:'#e9ddc7',200:'#d7c29f',300:'#baa276',400:'#a08555',500:'#896d3e',600:'#755a30',700:'#624c2b',800:'#514127',900:'#443724'},

        green: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        emerald: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        blue: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        indigo: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        purple: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        violet: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        pink: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        cyan: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        teal: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        orange: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        yellow: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        lime: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        sky: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        fuchsia: {50: 'rgb(var(--theme-50, 53 79 67) / <alpha-value>)',100: 'rgb(var(--theme-100, 53 79 67) / <alpha-value>)',200: 'rgb(var(--theme-200, 53 79 67) / <alpha-value>)',300: 'rgb(var(--theme-300, 53 79 67) / <alpha-value>)',400: 'rgb(var(--theme-400, 53 79 67) / <alpha-value>)',500: 'rgb(var(--theme-500, 53 79 67) / <alpha-value>)',600: 'rgb(var(--theme-600, 53 79 67) / <alpha-value>)',700: 'rgb(var(--theme-700, 53 79 67) / <alpha-value>)',800: 'rgb(var(--theme-800, 53 79 67) / <alpha-value>)',900: 'rgb(var(--theme-900, 53 79 67) / <alpha-value>)',950: 'rgb(var(--theme-950, 53 79 67) / <alpha-value>)'},
        white: '#faf8f2',
        black: '#292e29',
        red: {50:'#f5ece5',100:'#ebd8ca',200:'#ddbdab',300:'#c69a83',400:'#ad775f',500:'#965f48',600:'#824c38',700:'#723f30',800:'#61392d',900:'#503329'},

        border:     'hsl(var(--border))',
        input:      'hsl(var(--input))',
        ring:       'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT:    'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT:    'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT:    'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT:    'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT:    'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT:    'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        brand: {
          DEFAULT: 'rgb(var(--brand-rgb, 53 79 67) / <alpha-value>)',
          dark:    'rgb(var(--brand-dark-rgb, 44 64 56) / <alpha-value>)',
          light:   'rgb(var(--brand-soft-rgb, 231 228 219) / <alpha-value>)',
        },
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.625rem',
        sm: '0.5rem',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
