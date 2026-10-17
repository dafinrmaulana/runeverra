// ESLint: catches bugs and risky patterns. Formatting is Prettier's job (.prettierrc.json),
// so eslint-config-prettier switches off every rule that would fight it.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'dist-artifact', 'node_modules', 'docs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
    rules: {
      eqeqeq: ['error', 'always', { null: 'ignore' }], // `x != null` (null or undefined) is intended
      'prefer-const': 'error',
      'no-var': 'error',
      '@typescript-eslint/consistent-type-imports': 'error', // Node strips types: type imports must say so
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // Parameters are read far from where they are passed: name them with a word, never a single letter.
      'no-restricted-syntax': [
        'error',
        {
          selector: ':function > Identifier.params[name=/^_?[A-Za-z]$/]',
          message: 'Name parameters with a word, not a single letter.',
        },
        {
          selector: ':function > AssignmentPattern.params > Identifier.left[name=/^_?[A-Za-z]$/]',
          message: 'Name parameters with a word, not a single letter.',
        },
        {
          selector: ':function > :matches(ObjectPattern, ArrayPattern).params Identifier[name=/^_?[A-Za-z]$/]',
          message: 'Name destructured parameters with a word, not a single letter.',
        },
        {
          selector: 'CatchClause > Identifier.param[name=/^[A-Za-z]$/]',
          message: 'Name the caught error, e.g. `error`.',
        },
      ],
    },
  },
  {
    files: ['src/ui/**/*.tsx', 'src/ui/**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['server/**', 'test/**', '*.js', '*.mjs', 'vite.config.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  { files: ['public/sw.js'], languageOptions: { globals: { ...globals.serviceworker } } },
  prettier,
);
