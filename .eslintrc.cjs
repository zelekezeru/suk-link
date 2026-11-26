module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'android', 'ios', 'supabase/functions'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'off',
  },
  overrides: [
    {
      // User-facing copy must go through i18n (six locales, Build Plan §8.1).
      // The key-parity test cannot see strings that never became keys; this rule can.
      files: ['src/**/*.tsx'],
      excludedFiles: [
        // Developer-only screens and the static-demo presenter helper stay English.
        'src/components/ui/DevUiGallery.tsx',
        'src/components/ui/TrialDemoControls.tsx',
        // Staff console: English-only for now. Translate before onboarding non-English staff.
        'src/features/admin/AdminPages.tsx',
      ],
      rules: {
        'no-restricted-syntax': [
          'error',
          {
            selector: 'JSXText[value=/[A-Za-z]{3,}/]:not([value=/@/])',
            message: 'Put user-facing text in src/i18n/*.json and render it with t().',
          },
          {
            selector:
              'JSXAttribute[name.name=/^(title|placeholder|aria-label|label|description|actionLabel|alt)$/] > Literal[value=/[A-Za-z]{3,}/]:not([value=/@/])',
            message: 'Put user-facing text in src/i18n/*.json and render it with t().',
          },
          {
            selector: 'CallExpression[callee.object.name="toast"] > Literal[value=/[A-Za-z]{3,}/]',
            message: 'Toast messages must be translated: toast.success(t(...)).',
          },
        ],
      },
    },
  ],
};
