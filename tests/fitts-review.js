// Review regressions against the actual integrated module and real Shell actors.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import GdkPixbuf from 'gi://GdkPixbuf';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import Openbar from '../openbar@neuromorph/extension.js';

const dir = GLib.getenv('OPENBAR_TEST_DIR');
const mode = GLib.getenv('OPENBAR_FITTS_REVIEW_CASE') || 'all';
const version = parseInt(Config.PACKAGE_VERSION);
const path = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('openbar@neuromorph').get_path();
let checks = 0;
function assert(ok, message) {
    if (!ok) throw new Error(message);
    checks++;
}
function read(file) { return new TextDecoder().decode(GLib.file_get_contents(file)[1]); }
function metadata() { return {...JSON.parse(read(`${path}/metadata.json`)), path, dir: Gio.File.new_for_path(path)}; }
function settings() {
    const schemas = Gio.SettingsSchemaSource.new_from_directory(`${dir}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
    const value = new Gio.Settings({settings_schema: schemas.lookup('org.gnome.shell.extensions.openbar', false)});
    value.set_boolean('fitts-widgets', true);
    return value;
}
let serial = 0;
function fixture() {
    const target = new PanelMenu.Button(0, 'Fitts review');
    target.add_child(new St.Label({text: 'Review'}));
    Main.panel.addToStatusArea(`openbar-fitts-review-${++serial}`, target, 0, 'left');
    const btn = target.get_parent();
    // Delegate to native signals, retaining the precise IDs created on this actor.
    const ids = [];
    const connect = btn.connect;
    btn.connect = function (signal, callback) {
        const id = connect.call(this, signal, callback);
        if (signal === 'destroy') ids.push(id);
        return id;
    };
    return {target, btn, ids};
}
function liveHooks(item) { return item.ids.filter(id => GObject.signal_handler_is_connected(item.btn, id)).length; }
function noWidgets(item, label) {
    assert(!item.btn.FittsWidget, `${label}: no button chrome`);
    assert(!item.btn.destroyFittsId, `${label}: no stored destroy hook`);
    assert(liveHooks(item) === 0, `${label}: exactly zero live button destroy hooks (got ${liveHooks(item)})`);
}
function methodExtension() {
    const value = new Openbar(metadata());
    Object.assign(value, {
        _settings: settings(), _shellSettings: new Gio.Settings({schema_id: 'org.gnome.shell'}),
        gnomeVersion: version, disabling: false,
        panelBoxes: [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox],
        addedSignal: 'child-added', removedSignal: 'child-removed',
    });
    return value;
}
async function existingRegressions() {
    const extension = methodExtension();
    const item = fixture();
    const box = item.btn.get_parent();
    const style = Main.panel.get_style();
    Main.panel.set_style('margin-top: 8px;');
    try {
        extension.enableFittsWidgets();
        assert(!!item.btn.FittsWidget === (version < 50), 'native version policy on initial enable');
        for (let n = 0; n < 8; n++) { item.target.hide(); item.target.show(); }
        if (version < 50) assert(liveHooks(item) === 1, 'repeated hide/show retains exactly one destroy hook');
        extension.disableFittsWidgets();
        noWidgets(item, 'hide/show then feature disable');
        extension.enableFittsWidgets();
        box.remove_child(item.btn);
        Main.uiGroup.add_child(item.btn);
        noWidgets(item, 'remove surviving container');
        for (let n = 0; n < 8; n++) { item.target.hide(); item.target.show(); }
        noWidgets(item, 'off-panel hide/show');
        assert(!extension._fittsConnections?.connections.some(c => c.obj === item.target), 'removed button visibility watcher disconnected');
        extension.disableFittsWidgets();
        noWidgets(item, 'off-panel feature disable');
        assert(!Main.panel.leftFittsWidget && !Main.panel.rightFittsWidget, 'feature disable removes both corners');
        Main.uiGroup.remove_child(item.btn);
        box.insert_child_at_index(item.btn, 0);
        extension.enableFittsWidgets();
        assert(!!item.btn.FittsWidget === (version < 50), 'surviving button reconnects after reparent/re-enable');
        extension.disableFittsWidgets();
        noWidgets(item, 're-enabled feature cleanup');
        // A disable before Fitts initialization must not require a manager or boxes.
        new Openbar(metadata()).disableFittsWidgets();
        checks++;
        if (version < 50) {
            const original = extension.connectFittsWidgetVisible;
            extension.connectFittsWidgetVisible = () => { throw new Error('expected partial-enable interruption'); };
            let interrupted = false;
            try { extension.enableFittsWidgets(); } catch (error) { interrupted = error.message === 'expected partial-enable interruption'; }
            extension.connectFittsWidgetVisible = original;
            assert(interrupted, 'partial-enable interruption reached after chrome creation');
            extension.disableFittsWidgets();
            noWidgets(item, 'partial-enable cleanup');
            assert(!Main.panel.leftFittsWidget && !Main.panel.rightFittsWidget, 'partial-enable corner cleanup');
        }
        print(`PASS: existing merged lifecycle regressions GNOME ${Config.PACKAGE_VERSION}`);
    } finally {
        extension.disableFittsWidgets();
        item.target.destroy();
        Main.panel.set_style(style);
    }
}
async function directOffPanel() {
    const extension = methodExtension();
    const item = fixture();
    const box = item.btn.get_parent();
    try {
        extension.enableFittsWidgets();
        box.remove_child(item.btn);
        Main.uiGroup.add_child(item.btn);
        noWidgets(item, 'before direct off-panel call');
        extension.createFittsWidget(Main.uiGroup, item.btn);
        noWidgets(item, 'direct off-panel parent rejected');
        // A stale callback may still hold a formerly valid panel box.
        extension.createFittsWidget(box, item.btn);
        noWidgets(item, 'stale panel-box argument rejected');
        extension.updateFittsWidgetVisible(item.btn, item.target);
        noWidgets(item, 'direct stale visibility callback rejected');
        extension.disableFittsWidgets();
        noWidgets(item, 'direct off-panel cleanup');
    } finally {
        // On RED restore panel membership so the existing disable path can clean it.
        if (item.btn.get_parent() !== box) {
            item.btn.get_parent()?.remove_child(item.btn);
            box.insert_child_at_index(item.btn, 0);
        }
        extension.disableFittsWidgets();
        item.target.destroy();
    }
}
async function cornerDebounce() {
    const extension = methodExtension();
    const item = fixture();
    const box = item.btn.get_parent();
    let unrelated = null;
    try {
        extension.enableFittsWidgets();
        await Scripting.sleep(100);
        if (version >= 50) {
            assert(!extension.fittsCornerTimeoutId && extension._timeouts.size === 0, 'native 50 gate creates no corner timers');
            return;
        }
        assert(Main.panel.leftCornerButton === item.btn, 'fixture is the actual physical corner target');
        box.remove_child(item.btn);
        Main.uiGroup.add_child(item.btn);
        assert(!!extension.fittsCornerTimeoutId, 'corner removal schedules recreation');
        assert(extension._timeouts.has('fittsCornerTimeoutId'), 'corner recreation is tracked by named timer ledger');
        assert(!Main.panel.leftFittsWidget && !Main.panel.rightFittsWidget, 'removed corner destroys previous corner chrome');
        unrelated = new PanelMenu.Button(0, 'Unrelated center change');
        unrelated.add_child(new St.Label({text: 'Center'}));
        Main.panel.addToStatusArea(`openbar-fitts-review-center-${++serial}`, unrelated, 0, 'center');
        assert(!!extension.fittsCornerTimeoutId, 'unrelated center addition preserves pending corner recreation');
        await Scripting.sleep(650);
        assert(Main.panel.leftFittsWidget && Main.panel.rightFittsWidget, 'corners recreated after unrelated center addition');
        assert(!extension.fittsCornerTimeoutId && !extension._timeouts.has('fittsCornerTimeoutId'), 'completed recreation clears timer field and ledger');
        extension.disableFittsWidgets();
        assert(extension._timeouts.size === 0, 'disable leaves no stale corner timer ledger');
        assert(!Main.panel.leftFittsWidget && !Main.panel.rightFittsWidget, 'debounced corners cleaned on disable');
    } finally {
        extension.disableFittsWidgets();
        unrelated?.destroy();
        item.target.destroy();
    }
}
async function fullLifecycle() {
    const wallpaper = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 32, 32);
    wallpaper.fill(0x5380b0ff);
    wallpaper.savev(`${dir}/wallpaper.png`, 'png', [], []);
    const background = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
    const uri = Gio.File.new_for_path(`${dir}/wallpaper.png`).get_uri();
    background.set_string('picture-uri', uri);
    background.set_string('picture-uri-dark', uri);
    settings();
    const extension = new Openbar(metadata());
    const item = fixture();
    try {
        for (let cycle = 0; cycle < 2; cycle++) {
            extension.enable();
            await Scripting.sleep(6000);
            assert(!!item.btn.FittsWidget === (version < 50), 'real delayed extension enable respects native gate');
            for (let n = 0; n < 8; n++) { item.target.hide(); item.target.show(); }
            extension._settings.set_boolean('fitts-widgets', false);
            noWidgets(item, 'real setting disable after hide/show');
            extension._settings.set_boolean('fitts-widgets', true);
            if (cycle === 1) {
                item.btn.get_parent().remove_child(item.btn);
                Main.uiGroup.add_child(item.btn);
                for (let n = 0; n < 8; n++) { item.target.hide(); item.target.show(); }
                noWidgets(item, 'real enabled extension off-panel hide/show');
            }
            extension.disable();
            await extension._styleCleanup;
            noWidgets(item, 'real extension disable');
            item.target.hide(); item.target.show();
            await Scripting.sleep(700);
            noWidgets(item, 'after disabled visibility and delayed callbacks');
            assert(!Main.panel.leftFittsWidget && !Main.panel.rightFittsWidget, 'real extension disable removes corners');
        }
    } finally {
        if (!extension.disabling) { extension.disable(); await extension._styleCleanup; }
        item.target.destroy();
    }
}
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        (async () => {
            await Scripting.sleep(500);
            if (mode === 'all' || mode === 'existing') await existingRegressions();
            if (mode === 'all' || mode === 'direct') await directOffPanel();
            if (mode === 'all' || mode === 'corner') await cornerDebounce();
            if (mode === 'all' || mode === 'lifecycle') await fullLifecycle();
            const result = `PASS: GNOME ${Config.PACKAGE_VERSION} Fitts review ${mode}: ${checks} assertions`;
            print(result);
            GLib.file_set_contents(`${dir}/result`, `${result}\n`);
        })().catch(error => logError(error, 'Fitts review regression failed')).finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
export async function run() { await new Promise(() => {}); }
