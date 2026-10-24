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
    } else {
        throw Error(`unimplemented test group ${group}`);
    }
    obar.disable(); await obar._styleCleanup;
    assert(obar._settings === null && obar._connections === null, 'exported lifecycle cleanup');
    await Scripting.sleep(300);
}
