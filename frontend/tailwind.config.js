/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        display: ['"Share Tech Mono"', 'monospace'],
      },
      colors: {
        // Act I — crimson control room (GDD §7.2)
        'act1-bg':        '#0D0404',
        'act1-surface':   '#1A0A0A',
        'act1-panel':     '#1E1218',
        'act1-red':       '#C0392B',
        'act1-amber':     '#F39C12',
        'act1-dim':       '#4A1515',
        // Shared UI
        'terminal-green': '#00FF88',
        'cold-cyan':      '#5DADE2',
        'system-white':   '#E8F4FD',
      },
      animation: {
        'flicker':    'flicker 4s infinite',
        'scanline':   'scanline 8s linear infinite',
        'pulse-red':  'pulseRed 2s ease-in-out infinite',
        'typewriter': 'typewriter 0.05s steps(1) forwards',
        'glitch':     'glitch 0.3s ease forwards',
      },
      keyframes: {
        flicker: {
          '0%,100%': { opacity: '1' },
          '92%':     { opacity: '1' },
          '93%':     { opacity: '0.4' },
          '94%':     { opacity: '1' },
          '96%':     { opacity: '0.6' },
          '97%':     { opacity: '1' },
        },
        scanline: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        pulseRed: {
          '0%,100%': { boxShadow: '0 0 8px #C0392B44' },
          '50%':     { boxShadow: '0 0 24px #C0392B99' },
        },
        glitch: {
          '0%':   { transform: 'translate(0)' },
          '20%':  { transform: 'translate(-3px, 1px)' },
          '40%':  { transform: 'translate(3px, -1px)' },
          '60%':  { transform: 'translate(-1px, 2px)' },
          '80%':  { transform: 'translate(1px, -1px)' },
          '100%': { transform: 'translate(0)' },
        },
      },
    },
  },
  plugins: [],
}
