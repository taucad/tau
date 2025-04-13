const { NxAppWebpackPlugin } = require('@nx/webpack/app-plugin');
const { join } = require('path');

/**
 * @type {import('webpack').Configuration}
 */
module.exports = {
  output: {
    path: join(__dirname, '../../dist/apps/api'),
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    extensionAlias: {
      '.js': ['.ts', '.js']
    }
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
    }),
  ],
};
