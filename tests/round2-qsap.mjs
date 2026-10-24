// Exact production registration + class/methods; QSAP-shaped host actors, not QSAP integration.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fixture, Emitter} from './runtime-harness.mjs';
class Actor extends Emitter {
    children = []; classes = new Set();
    get_children() { return this.children; }
    [Symbol.iterator]() { return this.children[Symbol.iterator](); }
    add_style_class_name(c) { this.classes.add(c); }
    remove_style_class_name(c) { this.classes.delete(c); }
    add(a) { this.children.push(a); this.emit('child-added', a); }
    remove(a) { this.children.splice(this.children.indexOf(a), 1); this.emit('child-removed', a); }
    destroy() { this.emit('destroy'); this.ids.clear(); }
}
class PanelGrid {
    box = new Actor();
    _get_panels() { return this.box.children.flatMap(c => c.children); }
}
function grid() { const g = new PanelGrid(); g.box.add(new Actor()); g.box.children[0].add(new Actor()); return g; }
const source = fs.readFileSync(new URL('../openbar@neuromorph/extension.js', import.meta.url), 'utf8');
function setup() {
    const f = fixture(), {ext: o, context, Main} = f;
    const q = Object.assign(new context.PanelMenu.Button(), new Emitter());
    // Class fields are not prototype methods: install real emitter methods, not a fake menu-set callback.
    for (const name of ['connect', 'disconnect', 'emit', 'count']) q[name] = Emitter.prototype[name];
    q.menu = grid(); Main.panel.statusArea = {quickSettings: q};
    o.panelBoxes = [[{child: q}]]; o.addedSignal = 'child-added'; o.removedSignal = 'child-removed';
    o._settings.set_boolean('menustyle', true);
    o.updatePanelStyle = () => o.applyMenuStyles(Main.panel, o._settings.get_boolean('menustyle'));
    const registration = source.match(/\[qSettings, 'menu-set', this\.setupLibpanel\.bind\(this\)[^\]]*\]/)?.[0];
    assert.ok(registration, 'test must execute the exact enable registration');
    context.qSettings = q;
    const [obj, sig, cb, param] = vm.runInContext(`(function(){return ${registration}})`, context).call(o);
    o._connections.connect(obj, sig, cb, param);
    o.setupLibpanel(q, 'enabled', null, q.menu); o.applyMenuStyles(Main.panel, true);
    return {...f, q};
}
const tests = {
    current() {
        const {ext: o, q} = setup(), old = q.menu, current = grid();
        q.menu = current; q.emit('menu-set');
        assert.ok(current.box.count('child-added') > 0, 'replacement current root observed, not captured enable root');
        assert.equal(old.box.count('child-added'), 0, 'old root disconnected');
        assert.equal(old.box.children[0].count('child-added'), 0, 'old column disconnected');
        assert.ok(!old._get_panels()[0].classes.has('openmenu'), 'surviving old panels cleaned');
        o._connections.disconnectAll();
    },
    lifecycle() {
        const {ext: o, Main, q, context} = setup(), root = q.menu, col = root.box.children[0];
        for (let n = 0; n < 3; n++) o.setupLibpanel(q, 'menu-set', null, q.menu);
        assert.equal(col.count('child-added'), 1, 'repeated setup does not duplicate column observer');
        const lateCol = new Actor(), latePanel = new Actor(); lateCol.add(latePanel); root.box.add(lateCol);
        assert.ok(latePanel.classes.has('openmenu'), 'prepopulated late column styled immediately');
        const laterPanel = new Actor(); lateCol.add(laterPanel);
        assert.ok(laterPanel.classes.has('openmenu'), 'late panel styled');
        lateCol.remove(laterPanel);
        assert.ok(!laterPanel.classes.has('openmenu'), 'removed panel cleaned');
        root.box.remove(lateCol);
        assert.equal(lateCol.count('child-added'), 0, 'removed column disconnected');
        assert.ok(!latePanel.classes.has('openmenu'), 'removed column panels cleaned');
        o._settings.set_boolean('menustyle', false); o.applyMenuStyles(Main.panel, false);
        assert.equal(q.count('menu-set'), 2, 'menustyle off preserves independent QSAP menu-set hook');
        const off = grid(); q.menu = off; q.emit('menu-set');
        assert.ok(off.box.count('child-added') > 0, 'replacement while style off still observed');
        assert.ok(!off._get_panels()[0].classes.has('openmenu'), 'style-off replacement unstyled');
        o._settings.set_boolean('menustyle', true); o.applyMenuStyles(Main.panel, true);
        assert.ok(off._get_panels()[0].classes.has('openmenu'), 'style back on styles current panels');
        q.menu = {box: new Actor()}; q.emit('menu-set');
        assert.equal(off.box.count('child-added'), 0, 'transition back to native menu disconnects grid');
        // Exercise exported teardown, rather than manufacturing its cleanup result.
        const managerClass = o._connections.constructor;
        const retained = grid(); q.menu = retained; q.emit('menu-set');
        assert.ok(retained._get_panels()[0].classes.has('openmenu'), 'retained current panel styled before disable');
        o.panelBoxes = []; // native panel actor teardown is covered by private Shell suites
        o.disable();
        assert.equal(retained.box.ids.size, 0, 'disable releases off-panel root observers and destroy hooks');
        assert.equal(retained.box.children[0].ids.size, 0, 'disable releases column observers and destroy hooks');
        assert.equal(retained._get_panels()[0].ids.size, 0, 'disable releases panel destroy hooks');
        assert.ok(!retained._get_panels()[0].classes.has('openmenu'), 'disable cleans surviving off-panel panel');
        assert.equal(q.count('menu-set'), 0, 'disable releases emitter hooks');
        assert.equal(o._libpanelConnections, null, 'disable releases QSAP connection manager');
        o.disabling = false;
        o._settings = new context.Gio.Settings(); o._settings.set_boolean('menustyle', true);
        o._connections = new managerClass();
        o.panelBoxes = [[{child: q}]];
        q.menu = grid(); o.setupLibpanel(q, 'enabled', null, q.menu); o.applyMenuStyles(Main.panel, true);
        assert.ok(q.menu.box.count('child-added') > 0, 'new lifecycle observes current root');
        q.menu.box.children[0].destroy(); q.menu.box.destroy();
        o._libpanelConnections?.disconnectAll(); o._connections.disconnectAll();
    },
};
let failed = 0;
for (const [name, test] of Object.entries(tests)) {
    try { test(); console.log(`PASS round2-qsap ${name}`); }
    catch (e) { failed++; console.error(`FAIL round2-qsap ${name}: ${e.stack}`); }
}
process.exitCode = failed ? 1 : 0;
