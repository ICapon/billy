const nextJest = require('next/jest.js');

const createJestConfig = nextJest({
  dir: './',
});

const config = {
  displayName: 'web',
  preset: '../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/apps/web',
  testEnvironment: 'jsdom',
};

const jestConfig = createJestConfig(config);

module.exports = async () => {
  const resolved = await jestConfig();
  // HeroUI (and its react-aria deps) ship ESM only; let SWC transform them.
  resolved.transformIgnorePatterns = [
    '/node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?(?:@heroui|@react-aria|@react-stately|@react-types|@internationalized|tailwind-variants|tailwind-merge)/)',
    '^.+\\.module\\.(css|sass|scss)$',
  ];
  // Disable SWC path alias resolution — handled by Nx jest resolver.
  for (const value of Object.values(resolved.transform)) {
    if (Array.isArray(value) && value[1]?.resolvedBaseUrl) {
      value[1] = { ...value[1], resolvedBaseUrl: undefined };
    }
  }
  return resolved;
};
