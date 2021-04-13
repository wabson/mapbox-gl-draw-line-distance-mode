const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');

module.exports = {
    mode: 'development',
    entry: {
        'lib': './src/index.js',
        'demo': './demo/index.js'
    },
    node: {
        fs: 'empty'
    },
    devServer: {
        contentBase: './dist',
    },
    module: {
        rules: [
            {
                test: /\.css$/i,
                use: [MiniCssExtractPlugin.loader, 'css-loader'],
            },
        ],
    },
    plugins: [
        new CleanWebpackPlugin(),
        new MiniCssExtractPlugin(),
        new HtmlWebpackPlugin({
            // inject: false,
            // template: require('html-webpack-template'),
            title: 'Mapbox GL JS Draw Feature Info',
            // bodyHtmlSnippet: '<div id="map"></div>',
        })
    ],
    output: {
        filename: '[name].bundle.js',
        path: path.resolve(__dirname, 'dist'),
        library: 'mapboxglFeatureInfo',
        libraryTarget: 'global',
    },
};