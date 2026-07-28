import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist/**'] },

  js.configs.recommended,

  // component scripts: browser globals, ES modules
  {
    files: ['src/scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
    rules: {
      'no-console': 'warn',
    },
  },

  // build config at the repo root: node globals, CommonJS
  {
    files: ['*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
];
