/**
 * Hack to allow us to modify jsdom from within tests
 * from https://github.com/facebook/jest/issues/5124#issuecomment-352749005
 * */

const JSDOMEnvironment = require('jest-environment-jsdom');

module.exports = class JSDOMEnvironmentGlobal extends JSDOMEnvironment {
  constructor(config) {
    super(config);

    this.global.jsdom = this.dom;
  }

  teardown() {
    // Stop the auto-advancing fake clock before closing its DOM environment.
    this.global.clock?.uninstall();
    this.global.jsdom = null;

    return super.teardown();
  }
};
