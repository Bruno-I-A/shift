module.exports = {
  content: ['./*.html', './assets/*.js'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#191918', 2: '#252622' },
        accent: { DEFAULT: '#EAE5DC', deep: '#D5D0C6' },
        gold: '#EAE5DC', paper: '#EAE5DC',
        purple: { DEFAULT: '#EAE5DC', deep: '#D5D0C6' }
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace']
      }
    }
  }
};
