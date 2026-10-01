const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    ignores: ['dist/*', '.expo/*', 'src/shared/db/migrations/*'],
  },
  {
    settings: {
      'import/resolver': {
        typescript: { project: './jsconfig.json' },
      },
    },
    rules: {
      'import/no-named-as-default-member': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'react/prop-types': 'off',
    },
  },
  {
    files: ['**/__tests__/**/*.js', '**/*.test.js', '**/*.bench.js'],
    languageOptions: {
      globals: { describe: 'readonly', it: 'readonly', expect: 'readonly', jest: 'readonly' },
    },
  },
  {
    files: ['src/shared/db/testing/**/*.js'],
    languageOptions: { globals: { __dirname: 'readonly' } },
  },
]);
