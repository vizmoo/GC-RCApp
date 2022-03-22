var path = require('path');
var webpack = require('webpack');
     
module.exports = {
    entry: './client/public/js/main.js',
    output: {
        path: path.resolve(__dirname, './client/public/js'),
        filename: 'mainjs.js'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                loader: 'babel-loader',
                options: {
                    presets: ['@babel/react']
                }
            }
        ]
    },
    stats: {
        colors: true
    },
    devtool: 'source-map'
};