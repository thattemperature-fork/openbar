// Rejections stay visible, but never escape detached synchronous Shell callbacks.
import assert from 'node:assert/strict';
import {fixture} from './runtime-harness.mjs';
const {ext, context} = fixture();
const errors = [];
context.console = {error: message => errors.push(message)};
assert.equal(await ext._runStyleTask('success', () => Promise.resolve(true)), true);
assert.equal(await ext._runStyleTask('async test', () => Promise.reject(Error('injected async failure'))), false);
assert.equal(await ext._runStyleTask('sync test', () => {throw Error('injected sync failure');}), false);
assert.deepEqual(errors, ['Open Bar: async test failed: injected async failure', 'Open Bar: sync test failed: injected sync failure']);
// Check lifecycle cancellation occurs before settings release, not after a yield.
let invalidated = false;
context.StyleSheets.invalidateStyleWrites = owner => {
    assert.ok(owner._settings); invalidated = true; return Promise.resolve();
};
ext.applyMenuStyles = () => {};
ext.disable();
assert.ok(invalidated);
assert.equal(ext._settings, null);
await ext._styleCleanup;
console.log('integration detached error handling and invalidation: PASS');
