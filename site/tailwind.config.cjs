module.exports = {
  content: ['./*.html', './assets/*.js'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#071522', 2: '#0E2335' },
        accent: { DEFAULT: '#F2A63D', deep: '#D4841A' },
        gold: '#FFC93D', paper: '#F6F5F1',
        purple: { DEFAULT: '#B56BFF', deep: '#8A4DCC' }
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace']
      }
    }
  }
};
