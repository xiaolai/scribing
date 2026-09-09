/**
 * jsdom test environment that exposes the JSDOM instance to tests as `global.jsdom`,
 * so a test can call `jsdom.reconfigure({ url })` to exercise URL-dependent code paths.
 *
 * Constructor arguments are forwarded untouched, so a future change to Jest's
 * environment signature does not need an edit here.
 */
const JSDOMEnvironment = require('jest-environment-jsdom').TestEnvironment;

class ScribingJSDOMEnvironment extends JSDOMEnvironment {
  constructor(...args) {
    super(...args);
    this.global.jsdom = this.dom;
  }

  async teardown() {
    // Stop the auto-advancing fake clock before closing its DOM environment,
    // otherwise a queued timer fires against a torn-down window.
    this.global.clock?.uninstall?.();
    this.global.jsdom = null;
    await super.teardown();
  }
}

module.exports = ScribingJSDOMEnvironment;
module.exports.TestEnvironment = ScribingJSDOMEnvironment;
module.exports.default = ScribingJSDOMEnvironment;
