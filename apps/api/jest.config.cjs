/**
 * SC-012 (T264) : seuil de 80 % sur les règles métier pures. Les controllers,
 * modules Nest, tâches planifiées et adaptateurs de persistance sont couverts
 * par les suites d'intégration et de contrat, pas par ce seuil unitaire.
 */
const businessThreshold = { statements: 80, branches: 80, functions: 80, lines: 80 };

module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: '.*\\.spec\\.ts$',
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/test/integration/', '/test/contract/', '/test/e2e/'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/test/env.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts'],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    'src/modules/scoring/*.service.ts': businessThreshold,
    'src/modules/economy/ledger.math.ts': businessThreshold,
    'src/modules/economy/rewards.service.ts': businessThreshold,
    'src/modules/economy/hint.policy.ts': businessThreshold,
    'src/modules/battle-royale/elimination.rule.ts': businessThreshold,
    'src/modules/battle-royale/elimination.service.ts': businessThreshold,
    'src/modules/challenges/prerequisite-check.service.ts': businessThreshold,
    'src/modules/challenges/prerequisite-graph.service.ts': businessThreshold
  },
  clearMocks: true
};
