const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Define browser-specific configurations
const browserConfigs = {
  chromium: {
    outputPath: path.resolve(__dirname, 'build/chromium'),
    manifestPath: path.resolve(__dirname, 'src/platforms/chromium/manifest.json'),
  },
  firefox: {
    outputPath: path.resolve(__dirname, 'build/firefox'),
    manifestPath: path.resolve(__dirname, 'src/platforms/firefox/manifest.json'),
  },
  safari: {
    outputPath: path.resolve(__dirname, 'build/safari'),
    manifestPath: path.resolve(__dirname, 'src/platforms/safari/manifest.json'),
  },
};

// Get target browser from environment variable or default to chromium
const targetBrowser = process.env.TARGET_BROWSER || 'chromium';
const browserConfig = browserConfigs[targetBrowser];

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  entry: {
    background: './src/background/index.ts',
    content: './src/content-scripts/index.ts',
    popup: './src/ui/popup/index.tsx',
    options: './src/ui/options/index.tsx',
  },
  output: {
    path: browserConfig.outputPath,
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]',
        },
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@ui': path.resolve(__dirname, 'src/ui'),
      '@background': path.resolve(__dirname, 'src/background'),
      '@content-scripts': path.resolve(__dirname, 'src/content-scripts'),
      '@platforms': path.resolve(__dirname, 'src/platforms'),
      '@assets': path.resolve(__dirname, 'src/assets'),
    },
  },
  plugins: [
    // @htmltrust/canonicalization (a peer of @htmltrust/browser-client) has
    // a runtime fallback to node:crypto for use in Node.js environments. In
    // a browser bundle that import path is dead code (the runtime check
    // `typeof process !== 'undefined' && process.versions?.node` is false at
    // page-script runtime), but webpack still tries to resolve the dynamic
    // import at build time. IgnorePlugin tells webpack to skip the module
    // entirely; the dynamic import becomes a runtime ModuleNotFoundError
    // that the canonicalization lib catches and treats as "no Node crypto
    // available", which is the correct browser-side behavior.
    new webpack.IgnorePlugin({
      resourceRegExp: /^node:crypto$/,
    }),
    new CopyPlugin({
      patterns: [
        { from: browserConfig.manifestPath, to: 'manifest.json' },
        { from: 'src/assets', to: 'assets' },
      ],
    }),
    new HtmlWebpackPlugin({
      template: 'src/ui/popup/index.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),
    new HtmlWebpackPlugin({
      template: 'src/ui/options/index.html',
      filename: 'options.html',
      chunks: ['options'],
    }),
  ],
  devtool: 'source-map',
};