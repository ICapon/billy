const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

// pnpm keeps app-specific packages in apps/<app>/node_modules, which the default
// externals (root node_modules only) miss, so every bare import is external instead.
// Workspace libs (@org/*) are TypeScript sources and stay in the bundle; their npm
// dependencies are installed in the image from the generated package.json.
const externalizeBareImports = ({ request }, callback) => {
  if (
    !request ||
    request.startsWith('.') ||
    request.startsWith('/') ||
    request.startsWith('@org/')
  ) {
    return callback();
  }
  return callback(null, `commonjs ${request}`);
};

module.exports = {
  externals: [externalizeBareImports],
  output: {
    path: join(__dirname, 'dist'),
    clean: true,
    ...(process.env.NODE_ENV !== 'production' && {
      devtoolModuleFilenameTemplate: '[absolute-resource-path]',
    }),
  },
  plugins: [
    new NxAppWebpackPlugin({
      target: 'node',
      compiler: 'tsc',
      main: './src/main.ts',
      tsConfig: './tsconfig.app.json',
      assets: ['./src/assets'],
      optimization: false,
      outputHashing: 'none',
      generatePackageJson: true,
      mergeExternals: true,
      sourceMap: true,
    }),
  ],
};
