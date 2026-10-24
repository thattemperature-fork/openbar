import assert from 'node:assert/strict';
import {fixture, Emitter} from './runtime-harness.mjs';
{
    const {ext, timers, flush} = fixture(); let loads = 0;
    ext.isObarReset = true; ext.loadStylesheet = () => loads++;
    for (let i=0;i<20;i++) ext.onFullScreen(null, 'burst', null, 100);
    assert.equal(timers.size, 1, 'fullscreen bursts coalesce instead of losing timer IDs');
    ext.panelBoxes=[]; ext.msgLists=[]; ext.msgListIds=[];
    ext.disable(); flush();
    assert.equal(loads, 0, 'no style reload after disable');
    assert.equal(timers.size, 0, 'teardown does not queue calendar work');
    assert.doesNotThrow(() => ext.disable(), 'repeated disable');
}
{
    const {ext} = fixture(); const actor = new Emitter(), fn = () => {};
    ext._connections.connect(actor, 'changed', fn);
    ext._connections.connect(actor, 'changed', fn);
    assert.equal(actor.count('changed'), 1, 'same subscription is idempotent');
    assert.equal(actor.count('destroy'), 1, 'one auxiliary destroy hook per actor');
    ext._connections.disconnectAll();
    assert.equal(actor.ids.size, 0, 'all auxiliary destroy handlers disconnected');
    assert.equal(ext._connections.connections.length, 0, 'manager releases references');
    ext._connections.disconnectAll();
    ext._connections.connect(actor, 'changed', fn);
    actor.emit('destroy'); actor.ids.clear();
    assert.equal(ext._connections.connections.length, 0, 'destroy releases actor records');
}
{
    const {context} = fixture(); const partial = new context.Openbar({});
    assert.doesNotThrow(() => partial.disable(), 'disable after failure before settings/connections exist');
}
{
    const {ext, timers, flush} = fixture(); let calls=0;
    ext.setPanelStyle = () => calls++;
    ext.postStartup(); ext.postStartup();
    assert.equal(timers.size, 1, 'post-startup bursts coalesce');
    flush(); assert.equal(calls, 1);
    assert.equal(ext.postStartupId, null);
    ext._queueTimeout('exceptionId', () => {throw Error('injected callback');}, 0);
    assert.throws(() => flush(), /injected callback/);
    assert.equal(ext.exceptionId, null, 'throwing callback releases timer ID');
    assert.equal(ext._timeouts.size, 0);
    ext.disabling = true;
    ext._queueTimeout('blockedId', () => calls++, 0);
    assert.equal(timers.size, 0, 'cannot enqueue after disable');
}
{
    const {ext} = fixture(); const actor = new Emitter(); actor.meta_window = new Emitter();
    ext._settings.values.wmaxbar = true;
    // Isolate subscription lifecycle, not compositor window geometry.
    ext.setWindowMaxBar = () => {};
    ext._windowSignals = new Map();
    ext.onWindowAdded(null, 'added', actor); ext.onWindowAdded(null, 'added', actor);
    assert.equal(actor.count('notify::visible'), 1, 'window actor subscription does not duplicate');
    ext.onWindowRemoved(null, 'removed', actor);
    assert.equal(actor.ids.size, 0, 'window actor hooks released');
    assert.equal(actor.meta_window.ids.size, 0, 'meta window hooks released');
    ext.onWindowAdded(null, 'added', actor);
    actor.emit('destroy'); actor.ids.clear();
    assert.equal(ext._windowSignals.size, 0, 'destroyed window references released');
}
console.log('runtime cleanup regression: PASS');
