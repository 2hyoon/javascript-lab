const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const sass = require('sass');
const HandlebarsPlugin = require('handlebars-webpack-plugin');
const BrowserSyncPlugin = require('browser-sync-webpack-plugin')


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
    },

    /**
     * mode
     */
    mode: process.env.NODE_ENV || 'development',

    /**
     * devtool
     */
    devtool: 'source-map',

    /**
     * watch options
     */
    watchOptions: {
      ignored: /node_modules|dist|\.git/,
      poll: 1000,
      aggregateTimeout: 300,
    },

    /**
     * module
     */
    module: {
      rules: [
        /**
         * scripts
         */
        {
          test: /\.m?js$/,
          exclude: /(node_modules|bower_components)/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env'],
              // plugins: []
            },
          },
        },

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
      ],
    },

    /**
     * plugins
     */
    plugins: [
      new CleanWebpackPlugin(),
      new MiniCssExtractPlugin({
        filename: 'styles/[name].css',
      }),
      new CopyPlugin({
        patterns: [
          { from: './src/images/**/*', to: 'images/[name][ext]' },
          { from: './src/fonts/**/*', to: 'fonts/[name][ext]' },
        ],
      }),
      new HandlebarsPlugin({
        entry: path.join(process.cwd(), 'src', 'html', '*.html'),
        output: path.join(process.cwd(), 'dist', '[name].html'),
        partials: [path.join(process.cwd(), 'src', 'html', 'hbs', '*.hbs')],
      }),
      new BrowserSyncPlugin({
        // browse to http://localhost:3000/ during development,
        host: 'localhost',
        port: 3000,
        server: { baseDir: ['./dist'] }
      })
    ],
  });
