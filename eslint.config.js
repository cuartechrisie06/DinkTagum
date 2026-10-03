const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  globalIgnores(['dist/*', '.expo/*', '.expo-*/*', 'node_modules/*', 'supabase/*']),
  expoConfig,
  {
    files: ['**/*.test.js', '**/*.test.jsx'],
    languageOptions: {
      globals: globals.jest,
    },
  },
]);
