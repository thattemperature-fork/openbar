import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import GObject from 'gi://GObject';
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
const dir = GLib.getenv('OPENBAR_TEST_DIR');
const group = GLib.getenv('OPENBAR_PANEL_GROUP');
let checks = 0;
function assert(ok, label) { if (!ok) throw Error(label); checks++; print(`PASS ${label}`); }
function equal(a, b, label) { assert(JSON.stringify(a) === JSON.stringify(b), `${label}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); }
function read(path) { return new TextDecoder().decode(GLib.file_get_contents(path)[1]); }
function radii(actor) { return [0, 1, 2, 3].map(c => actor.get_theme_node().get_border_radius(c)); }
export async function run() { await new Promise(() => {}); }
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        test().then(() => GLib.file_set_contents(`${dir}/result`, `PASS Shell ${Config.PACKAGE_VERSION} ${group}: ${checks} assertions\n`))
            .catch(e => logError(e, 'round2 panel regression failed')).finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
async function test() {
    await Scripting.sleep(1200);
    const path = `${dir}/openbar@neuromorph`;
    const {default: Openbar} = await import(`file://${path}/extension.js`);
    const sheets = await import(`file://${path}/stylesheets.js`);
    const metadata = {...JSON.parse(read(`${path}/metadata.json`)), path, dir: Gio.File.new_for_path(path)};
    const wallpaper = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 32, 32);
    wallpaper.fill(0x487b99ff); wallpaper.savev(`${dir}/wall.png`, 'png', [], []);
    const uri = Gio.File.new_for_path(`${dir}/wall.png`).get_uri();
    const bg = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
    bg.set_string('picture-uri', uri); bg.set_string('picture-uri-dark', uri);
    const obar = new Openbar(metadata), settings = obar.getSettings();
    for (const key of ['bguri', 'dark-bguri', 'light-bguri']) settings.set_string(key, uri);
    for (const key of ['apply-gtk', 'apply-flatpak', 'fitts-widgets']) settings.set_boolean(key, false);
    obar.enable(); await obar._runtimeAssetsReady;
    await Scripting.sleep(6500);
    Main.overview.hide(); await Scripting.sleep(500);
    assert(!obar._fittsActive, 'core styling tested without Fitts observer');
    if (group === 'visibility') {
        const indicators = [Main.panel.statusArea.screenRecording, Main.panel.statusArea.screenSharing];
        assert(indicators.every(Boolean), 'actual recording and sharing actors exist');
        for (const actor of indicators) {
            assert(actor instanceof PanelMenu.ButtonBox, 'native indicator is a ButtonBox');
            assert(!actor.visible, 'native indicator initially hidden');
            actor.show(); await Scripting.sleep(350);
            assert(actor.get_parent().has_style_class_name('button-container'), 'first native show has container styling without Overview');
            const initial = [actor.width, actor.height];
            Main.overview.show(); await Scripting.sleep(650);
            equal([actor.width, actor.height], initial, 'Overview does not repair initial allocation');
            Main.overview.hide(); await Scripting.sleep(500);
            actor.hide(); await Scripting.sleep(100);
            const owned = obar._connections.connections.filter(c => c.obj === actor && c.sig === 'notify::visible');
            equal(owned.length, 1, 'one core visibility connection per native indicator');
            actor._round2VisibilityIds = owned.map(c => c.id);
        }
        obar.disable(); await obar._styleCleanup;
        for (const actor of indicators) {
            assert(actor._round2VisibilityIds.every(id => !GObject.signal_handler_is_connected(actor, id)), 'disable disconnects native visibility observation');
            delete actor._round2VisibilityIds;
            actor.show(); actor.hide();
        }
        obar.enable(); await obar._runtimeAssetsReady; await Scripting.sleep(1200);
        for (const actor of indicators)
            equal(obar._connections.connections.filter(c => c.obj === actor && c.sig === 'notify::visible').length, 1, 're-enable has no duplicate observers');
    } else if (group === 'trilands') {
        settings.set_string('bartype', 'Trilands');
        settings.set_double('bradius', 14);
        settings.set_boolean('set-overview', true);
        assert(await sheets.reloadStyle(obar, obar), 'generated Trilands stylesheet');
        const box = new St.BoxLayout();
        Main.panel.add_child(box);
        const buttons = [0, 1, 2].map(i => new PanelMenu.Button(0, `round2-${i}`));
        const bins = buttons.map(button => button.container);
        const unrelated = new St.Widget();
        box.add_child(unrelated);
        for (const bin of bins) box.add_child(bin);
        const originalOrder = box.get_children();
        const realBoxes = obar.panelBoxes;
        obar.panelBoxes = [box];
        try {
            for (const direction of [Clutter.TextDirection.LTR, Clutter.TextDirection.RTL]) {
                box.set_text_direction(direction);
                for (const visible of [[false, false, true], [true, false, false], [false, true, false],
                    [true, false, true], [true, true, true], [false, false, false], [false, true, false]]) {
                    buttons.forEach((button, i) => button.visible = visible[i]);
                    obar.setPanelStyle(null, 'notify::visible');
                    await Scripting.sleep(50);
                    assert(box.get_children().every((actor, i) => actor === originalOrder[i]), 'Trilands never reorders unrelated/hidden actors');
                    const shown = buttons.filter(button => button.visible);
                    const physical = direction === Clutter.TextDirection.RTL ? [...shown].reverse() : shown;
                    for (const button of shown) {
                        const left = button === physical[0] ? 14 : 0;
                        const right = button === physical.at(-1) ? 14 : 0;
                        equal(radii(button), [left, right, right, left], `native endpoint radii ${direction}/${visible}`);
                    }
                }
                // Once registered, visibility changes alone must refresh endpoints.
                buttons[0].hide(); buttons[1].show(); buttons[2].hide();
                equal(radii(buttons[1]), [14, 14, 14, 14], 'sole visible after signal-only hide/show');
                buttons[0].show();
                equal(radii(buttons[1]), direction === Clutter.TextDirection.RTL ? [14, 0, 0, 14] : [0, 14, 14, 0], 'hidden sibling show refreshes endpoints');
            }
            settings.set_string('bartype', 'Floating');
            obar.setPanelStyle(null, 'bartype');
            assert(bins.every(bin => !bin.get_style_pseudo_class()?.includes('trilands-')), 'switching type removes owned endpoint pseudo classes');
            settings.set_string('bartype', 'Trilands');
            obar.setPanelStyle(null, 'bartype');
            const ids = obar._connections.connections.filter(c => buttons.includes(c.obj));
            obar.disable(); await obar._styleCleanup;
            assert(ids.every(c => !GObject.signal_handler_is_connected(c.obj, c.id)), 'disable disconnects late panel visibility handlers');
            assert(bins.every(bin => !bin.get_style_pseudo_class()?.includes('trilands-')), 'disable removes owned endpoint pseudo classes');
            obar.panelBoxes = realBoxes;
            obar.enable(); await obar._runtimeAssetsReady;
        } finally {
            obar.panelBoxes = realBoxes;
            if (!obar.disabling) { obar.disable(); await obar._styleCleanup; }
            buttons.forEach(button => button.destroy());
            box.destroy();
            obar.enable(); await obar._runtimeAssetsReady;
        }
    } else if (group === 'selectors') {
        settings.set_boolean('apply-accent-shell', true);
        settings.set_boolean('apply-all-shell', true);
        settings.set_boolean('autohg-menu', false);
        settings.set_strv('mscolor', ['1', '0', '0']);
        settings.set_double('msalpha', 1);
        settings.set_string('dashdock-style', 'Default');
        assert(await sheets.reloadStyle(obar, obar), 'generated actual app-grid stylesheet');
        const root = new St.BoxLayout(); Main.uiGroup.add_child(root);
        const make = (cls, state, modern = false) => {
            const actor = new St.BoxLayout({style_class: cls});
            const icon = new St.Widget({style_class: 'overview-icon', width: 30, height: 30});
            actor.add_child(icon); root.add_child(actor); actor.set_style_pseudo_class(state);
            return modern ? actor : icon;
        };
        const color = actor => actor.get_theme_node().get_background_color().to_string();
        try {
            const active = make('app-well-app', 'active');
            equal(color(active), '#ff0000ff', 'active legacy positive control');
            for (const cls of ['app-well-app', 'show-apps', 'grid-search-result']) {
                for (const state of ['active', 'checked', 'checked hover'])
                    equal(color(make(cls, state)), color(active), `legacy ${cls}/${state} accent highlight`);
            }
            const focus = make('app-well-app', 'focus');
            assert(color(focus) !== '#00000000' && color(focus) !== color(active), 'focus uses distinct nontransparent highlight');
            for (const cls of ['app-well-app', 'grid-search-result'])
                for (const state of ['focus', 'selected'])
                    equal(color(make(cls, state)), color(focus), `legacy ${cls}/${state} selection highlight`);
            for (const state of ['active', 'checked', 'checked hover'])
                equal(color(make('overview-tile', state, true)), color(active), `modern overview-tile/${state} accent`);
            for (const state of ['focus', 'selected'])
                equal(color(make('overview-tile', state, true)), color(focus), `modern overview-tile/${state} selection`);
        } finally { root.destroy(); }
    } else {
        throw Error(`unimplemented test group ${group}`);
    }
    obar.disable(); await obar._styleCleanup;
    assert(obar._settings === null && obar._connections === null, 'exported lifecycle cleanup');
    await Scripting.sleep(300);
}
