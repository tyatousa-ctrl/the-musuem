import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', 'node_modules/**', 'client/public/**'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // State decoded by the Colyseus SDK is untyped on the client; `any` is confined to NetState.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
