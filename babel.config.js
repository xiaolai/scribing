// Browser targets come from the `browserslist` field in package.json, so the build
// and the documented runtime floor in docs/fonts.md cannot drift apart.
module.exports = {
  presets: ['@babel/preset-env', '@babel/preset-typescript'],
  env: {
    // Tests run in the CI/dev Node, not in the oldest supported browser.
    test: {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        '@babel/preset-typescript',
      ],
    },
  },
};
