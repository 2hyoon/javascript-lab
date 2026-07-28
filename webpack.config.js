const path = require('path');
const fs = require('fs');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const sass = require('sass');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const BrowserSyncPlugin = require('browser-sync-webpack-plugin');

const htmlDir = path.resolve(__dirname, 'src', 'html');
const htmlPages = fs
  .readdirSync(htmlDir)
  .filter((file) => file.endsWith('.html'));

module.exports = () => ({
  /**
   * entry
   */
  entry: {
    app: ['./src/scripts/app.js', './src/styles/app.scss'],
  },

  /**
   * output
   */
  output: {
    filename: 'scripts/[name].js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },

  /**
   * devtool
   */
  devtool: 'source-map',

  /**
   * watch options
   */
  watchOptions: {
    ignored: /node_modules|dist|\.git/,
    aggregateTimeout: 300,
  },

  /**
   * module
   */
  module: {
    rules: [
      /**
       * styles
       */
      {
        test: /\.(sa|sc|c)ss$/,
        use: [
          // extracts css into separate files
          MiniCssExtractPlugin.loader,

          // interprets @import
          {
            loader: 'css-loader',
            options: {
              sourceMap: true,
              // importLoaders: 2, // postcss-loader, sass-loader
            },
          },

          // transforming styles with JS plugins
          // see ./postcss.config.js
          'postcss-loader',

          // loads scss files and compiles it to css.
          {
            loader: 'sass-loader',
            options: {
              implementation: sass,
              sourceMap: true,
            },
          },
        ],
      },

      /**
       * html partials
       * scoped to src/html/partials so page templates are left to
       * html-webpack-plugin's own template loader
       */
      {
        test: /\.html$/,
        include: path.join(htmlDir, 'partials'),
        use: {
          loader: 'html-loader',
          options: {
            sources: false,
            esModule: false,
          },
        },
      },
    ],
  },

  /**
   * plugins
   */
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'styles/[name].css',
    }),
    new CopyPlugin({
      patterns: [
        { from: './src/images/**/*', to: 'images/[name][ext]' },
        { from: './src/fonts/**/*', to: 'fonts/[name][ext]' },
      ],
    }),
    // one instance per page in src/html, emitted flat into dist/
    ...htmlPages.map(
      (page) =>
        new HtmlWebpackPlugin({
          template: path.join(htmlDir, page),
          filename: page,
          // pages link app.js/app.css themselves, so nothing is auto-injected
          inject: false,
          minify: false,
        })
    ),
    new BrowserSyncPlugin({
      // browse to http://localhost:3000/ during development,
      host: 'localhost',
      port: 3000,
      server: { baseDir: ['./dist'] },
    }),
  ],
});
