module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'import'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  ignorePatterns: [
    'dist/',
    'build/',
    'coverage/',
    'node_modules/',
    '*.min.js',
    'apps/web/src/services/api-types.ts'
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    // Désactivé : NestJS s'appuie sur `emitDecoratorMetadata` et une importation
    // `import type` d'une classe injectable casse l'injection à l'exécution.
    '@typescript-eslint/consistent-type-imports': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    eqeqeq: ['error', 'always'],
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          {
            target: './apps/api/src/modules',
            from: './apps/api/src/modules',
            except: ['./'],
            message:
              "Un module ne peut pas importer directement le code interne d'un autre module : passer par un service exposé."
          }
        ]
      }
    ]
  },
  overrides: [
    {
      files: ['**/*.spec.ts', '**/*.test.ts', '**/test/**', '**/e2e/**'],
      env: { jest: true }
    }
  ]
};
