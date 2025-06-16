const config = {
  mode: 'production',
  entry: {

    // cart: './src/js/cart.js',
    index: './src/js/index.js',
  },
  output: {
    filename: '[name].bundle.js',
  },
  module: {
    rules: [{
      test: /\.css$/,
      use: ['style-loader', 'css-loader'],
    }, ],
  },
};

module.exports = config;