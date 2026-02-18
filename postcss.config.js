const autoprefixer = require('autoprefixer');

// module.exports = {
//   plugins: [autoprefixer],
// };

module.exports = {
  plugins: {
    '@tailwindcss/postcss': {}, // v4 전용 포스트프로세서
    autoprefixer: {},
  },
};
