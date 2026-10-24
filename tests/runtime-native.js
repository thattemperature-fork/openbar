// Private compositor only; memory GSettings and disposable HOME via runner.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const dir = GLib.getenv('OPENBAR_TEST_DIR');
let count = 0;
function assert(ok, message) { if(!ok) throw Error(message); count++; print(`PASS ${message}`); }
export async function run() { await new Promise(() => {}); }
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        test().then(() => GLib.file_set_contents(`${dir}/result`, `PASS Shell ${Config.PACKAGE_VERSION}: runtime: ${count} assertions\n`))
            .catch(e => logError(e, 'runtime native regression failed')).finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
async function test() {
    await Scripting.sleep(1000);
    const path = `${dir}/openbar@neuromorph`;
    const {default: Openbar} = await import(`file://${path}/extension.js`);
    const [, bytes] = GLib.file_get_contents(`${path}/metadata.json`);
    const metadata = {...JSON.parse(new TextDecoder().decode(bytes)), path, dir: Gio.File.new_for_path(path)};
    const wallpaper = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 32, 32);
    wallpaper.fill(0x5380b0ff); wallpaper.savev(`${dir}/wallpaper.png`, 'png', [], []);
    const bg = new Gio.Settings({schema_id:'org.gnome.desktop.background'});
    const uri = Gio.File.new_for_path(`${dir}/wallpaper.png`).get_uri();
    bg.set_string('picture-uri', uri); bg.set_string('picture-uri-dark', uri);
    await Scripting.sleep(500);
    const obar = new Openbar(metadata), LM = Main.layoutManager;
    const calendar = Main.panel.statusArea.dateMenu._calendar;
    const originalRebuild = calendar._rebuildCalendar;
    const appearance = new Gio.Settings({schema_id:'org.gnome.desktop.interface'});
    appearance.set_string('accent-color', 'blue');
    appearance.set_string('gtk-theme', 'Adwaita');
    appearance.set_string('icon-theme', 'Adwaita');
    const config = obar.getSettings();
    config.set_boolean('set-yarutheme', true);
    config.set_strv('mscolor', ['0.9', '0.1', '0.2']);
    const monitors = LM.monitors, primaryIndex = LM.primaryIndex;
    // Logical host-list transitions; not physical monitor removal or real RDP.
    try {
        LM.monitors = []; LM.primaryIndex = -1;
        obar.enable();
        assert(appearance.get_string('accent-color') !== 'blue', 'initial enable reapplies custom accent');
        assert(appearance.get_string('gtk-theme').startsWith('Yaru'), 'Yaru already enabled applies on startup');
        obar.connectPrimaryBGChanged();
        assert(!obar._primaryBGManager, 'enable without logical monitors');
        LM.monitors = monitors; LM.primaryIndex = primaryIndex;
        obar.updatePanelStyle(null, 'monitors-changed');
        const manager = obar._primaryBGManager;
        assert(!!manager, 'primary background bound on return');
        obar.connectPrimaryBGChanged(); obar.connectPrimaryBGChanged();
        assert(obar._connections.connections.filter(c => c.obj === manager && c.sig === 'changed').length === 1, 'one manager subscription');
        assert(obar._settings.get_int('monitor-width') === monitors[0].width, 'dimensions refreshed');
        // Stylesheet lane owns disable-during-write; settle its current promise.
        await Scripting.sleep(50);
        const settings = obar._settings;
        const connections = obar._connections;
        const actor = new St.Widget();
        connections.connect(actor, 'notify::visible', () => {});
        actor.destroy();
        assert(!connections.connections.some(c => c.obj === actor) && !connections.destroyConnections.has(actor), 'destroyed native actor released');
        for(let i=0;i<20;i++) { obar.onFullScreen(null,'burst',null,100); obar.postStartup(); obar.applyMenuStyles(Main.panel,true); }
        assert(obar._timeouts.size <= 7, 'burst work coalesces into named timers');
        LM.monitors = []; LM.primaryIndex = -1;
        obar.updatePanelStyle(null, 'monitors-changed');
        assert(!obar._primaryBGManager, 'manager unbound when absent');
        obar.disable();
        assert(obar._timeouts.size === 0, 'immediate disable cancels every extension timer');
        assert(calendar._rebuildCalendar === originalRebuild, 'calendar instance injection restored');
        assert(appearance.get_string('accent-color') === 'blue', 'disable restores owned accent');
        assert(appearance.get_string('gtk-theme') === 'Adwaita' && appearance.get_string('icon-theme') === 'Adwaita', 'disable restores independent Yaru originals');
        assert(connections.connections.length === 0 && connections.destroyConnections.size === 0, 'disconnect releases primary and auxiliary hooks');
        assert(obar.calendarTimeoutId === null, 'style removal does not create another calendar timer');
        // Restore host list before yielding: unrelated Shell actors require it.
        LM.monitors = monitors; LM.primaryIndex = primaryIndex;
        settings.set_boolean('menustyle', false);
        await Scripting.sleep(6000);
        assert(obar._settings === null && !Main.panel.has_style_class_name('openbar'), 'no post-disable reactivation');
        obar.disable();
        assert(obar._timeouts.size === 0, 'second disable remains idle');
    } finally { LM.monitors = monitors; LM.primaryIndex = primaryIndex; }
    obar.enable();
    await Scripting.sleep(5500);
    appearance.set_string('accent-color', 'green');
    appearance.set_string('gtk-theme', 'UserGTK');
    await Scripting.sleep(50);
    obar.disable();
    assert(appearance.get_string('accent-color') === 'green', 'later user accent survives disable');
    assert(appearance.get_string('gtk-theme') === 'UserGTK', 'later user GTK survives disable');
    assert(appearance.get_string('icon-theme') === 'Adwaita', 'icon restoration independent of GTK override');
    assert(obar._appearance.size === 0, 'appearance observers released');
    assert(obar._timeouts.size === 0, 'second enable/full-disable cycle cleaned');
    await Scripting.sleep(600);
    obar.enable();
    await Scripting.sleep(100);
    // Feature off restores its own keys only; accent remains owned until disable.
    obar._settings.set_boolean('set-yarutheme', false);
    assert(appearance.get_string('gtk-theme') === 'UserGTK' && appearance.get_string('icon-theme') === 'Adwaita', 'feature-off restores latest baseline');
    obar.disable();
    assert(appearance.get_string('accent-color') === 'green', 'repeated cycle captures current accent baseline');
    await Scripting.sleep(600);
    // A true enable prefix, with a failure injected at its external settings boundary.
    const partial = new Openbar(metadata);
    partial.getSettings = () => {throw Error('injected settings failure');};
    try { partial.enable(); throw Error('missing injected failure'); }
    catch(e) { assert(e.message === 'injected settings failure', 'partial enable reached failing boundary'); }
    partial.disable();
    assert(partial._settings === null && partial._connections === null, 'partial enable cleanup');
}
