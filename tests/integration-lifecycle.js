// Real lifecycle and Gio I/O; runner isolates all desktop/filesystem boundaries.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const dir = GLib.getenv('OPENBAR_TEST_DIR');
let count = 0;
function assert(value, label) { if (!value) throw Error(label); count++; print(`PASS ${label}`); }
function read(path) { return new TextDecoder().decode(GLib.file_get_contents(path)[1]); }
// Invoke actual Gio I/O but retain its completion callback until release. This
// gives a deterministic start boundary without synthesizing an I/O result.
function holdIO(method, predicate) {
    const original = Gio.File.prototype[method];
    let entered, held = null, released = false, claimed = false;
    const started = new Promise(resolve => entered = resolve);
    Gio.File.prototype[method] = function(...args) {
        if (claimed || !predicate(this)) return original.apply(this, args);
        claimed = true;
        const callback = args.pop();
        args.push((object, result) => {
            if (released) callback(object, result);
            else held = () => callback(object, result);
        });
        const value = original.apply(this, args);
        entered({file: this, cancellable: args.find(arg => arg instanceof Gio.Cancellable)});
        return value;
    };
    return {started, release() { released = true; held?.(); held = null; },
        restore() { Gio.File.prototype[method] = original; released = true; held?.(); held = null; }};
}
async function until(predicate, label) {
    for (let i = 0; i < 100; i++) {
        if (predicate()) return;
        await Scripting.sleep(30);
    }
    throw Error(`Timed out: ${label}`);
}
export async function run() { await new Promise(() => {}); }
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        test().then(() => GLib.file_set_contents(`${dir}/result`, `PASS Shell ${Config.PACKAGE_VERSION}: integration: ${count} assertions\n`))
            .catch(e => logError(e, 'integration lifecycle failed')).finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
async function test() {
    await Scripting.sleep(1000);
    const path = `${dir}/openbar@neuromorph`;
    const {default: Openbar} = await import(`file://${path}/extension.js`);
    const StyleSheets = await import(`file://${path}/stylesheets.js`);
    const metadata = {...JSON.parse(read(`${path}/metadata.json`)), path, dir: Gio.File.new_for_path(path)};
    const wallpaper = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 512, 512);
    wallpaper.fill(0x5380b0ff); wallpaper.savev(`${dir}/wallpaper.png`, 'png', [], []);
    const uri = Gio.File.new_for_path(`${dir}/wallpaper.png`).get_uri();
    const background = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
    background.set_string('picture-uri', uri); background.set_string('picture-uri-dark', uri);
    const system = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    system.set_string('color-scheme', 'prefer-dark');
    await Scripting.sleep(500);
    const obar = new Openbar(metadata), settings = obar.getSettings();
    for (const key of ['bguri', 'dark-bguri', 'light-bguri']) settings.set_string(key, uri);
    settings.set_string('color-scheme', 'default');
    settings.set_boolean('apply-gtk', true); settings.set_boolean('apply-flatpak', true);
    const config = GLib.get_user_config_dir();
    const originals = ['/* independent gtk3 */\n', '/* independent gtk4 */\n'];
    for (const [index, version] of [3, 4].entries()) {
        GLib.mkdir_with_parents(`${config}/gtk-${version}.0`, 0o700);
        GLib.file_set_contents(`${config}/gtk-${version}.0/gtk.css`, originals[index]);
    }
    const overrideDir = `${GLib.get_user_data_dir()}/flatpak/overrides`;
    GLib.mkdir_with_parents(overrideDir, 0o700);
    GLib.file_set_contents(`${overrideDir}/global`, '# independent\n[Context]\nfilesystems=home:ro;\n');
    function applied(label) {
        for (const [index, version] of [3, 4].entries())
            assert(read(`${config}/gtk-${version}.0/gtk.css`) !== originals[index], `${label}: GTK${version} generated`);
        for (const version of [3, 4])
            assert(read(`${overrideDir}/global`).includes(`xdg-config/gtk-${version}.0:ro`), `${label}: Flatpak GTK${version} grant present`);
    }
    function restored(label) {
        for (const [index, version] of [3, 4].entries())
            assert(read(`${config}/gtk-${version}.0/gtk.css`) === originals[index], `${label}: GTK${version} byte-exact restoration`);
        assert(!read(`${overrideDir}/global`).includes('xdg-config/gtk-'), `${label}: owned Flatpak grants removed`);
        assert(read(`${overrideDir}/global`).includes('home:ro'), `${label}: preexisting Flatpak grant retained`);
    }
    obar.enable();
    assert(settings.get_string('color-scheme') === 'prefer-dark', 'saved mode catch-up runs');
    await obar._runtimeAssetsReady;
    for (const asset of ['checkbox-off.svg', 'menu.svg', 'toggle-off.svg', 'toggle-off-hc.svg'])
        assert(read(`${obar.obarRunDir.get_path()}/assets/${asset}`) === read(`${path}/media/assets/${asset}`), `actual static asset completion: ${asset}`);
    await until(() => obar._paletteCounts?.dark?.some(n => n > 0), 'initial palette');
    assert(await StyleSheets.reloadStyle(obar, obar), 'initial stylesheet generation publishes');
    await StyleSheets.saveFlatpakOverrides(obar, 'enable');
    applied('initial enabled state');
    let reloads = 0;
    const reloadId = settings.connect('changed::reloadstyle', () => reloads++);
    // Keep queued-work cancellation as its own distinct case.
    const queued = StyleSheets.reloadStyle(obar, obar);
    obar.disable(); await Promise.all([queued, obar._styleCleanup]);
    restored('queued disable');
    // Now explicitly wait for a real stylesheet replacement and wallpaper read.
    obar.enable(); await obar._runtimeAssetsReady;
    await until(() => obar._paletteCounts?.dark?.some(n => n > 0), 'second initial palette');
    assert(await StyleSheets.reloadStyle(obar, obar), 'second enabled generation publishes');
    const writer = holdIO('replace_contents_bytes_async', file => file.get_basename() === 'stylesheet.css');
    const reader = holdIO('read_async', file => file.get_uri() === uri);
    try {
        const pending = StyleSheets.reloadStyle(obar, obar);
        const writeStart = await writer.started;
        assert(writeStart.cancellable && !writeStart.cancellable.is_cancelled(), 'real stylesheet I/O entered before disable');
        const oldPalette = obar.backgroundPalette();
        const readStart = await reader.started;
        const paletteCancel = obar._paletteCancellable;
        assert(readStart.cancellable === paletteCancel && !paletteCancel.is_cancelled(), 'real wallpaper I/O entered before disable');
        const atDisable = reloads;
        obar.disable();
        assert(writeStart.cancellable.is_cancelled(), 'disable cancels active stylesheet Gio operation');
        assert(paletteCancel.is_cancelled() && obar._paletteCancellable === null, 'disable cancels active wallpaper Gio operation');
        assert(obar._timeouts.size === 0, 'disable cancels trailing timers');
        writer.release(); reader.release();
        await Promise.all([pending, oldPalette, obar._styleCleanup]);
        assert(reloads === atDisable, 'no active-operation post-disable stylesheet publication');
        restored('active disable');
    } finally { writer.restore(); reader.restore(); }
    // Old active work must settle before cleanup and a same-turn new enable.
    for (let cycle = 0; cycle < 3; cycle++) {
        obar.enable(); await obar._runtimeAssetsReady;
        await until(() => obar._paletteCounts?.dark?.some(n => n > 0), 'rapid-cycle palette');
        assert(await StyleSheets.reloadStyle(obar, obar), `rapid cycle ${cycle}: initial generation applied`);
        const io = holdIO('replace_contents_bytes_async', file => file.get_basename() === 'stylesheet.css');
        try {
            const old = StyleSheets.reloadStyle(obar, obar);
            await io.started;
            obar.disable(); obar.enable();
            io.release();
            await old;
            assert(await StyleSheets.reloadStyle(obar, obar), `rapid cycle ${cycle}: latest generation publishes`);
            await StyleSheets.saveFlatpakOverrides(obar, 'enable');
            applied(`rapid cycle ${cycle}`);
            assert(Main.panel.has_style_class_name('openbar'), `rapid cycle ${cycle}: latest panel active`);
            obar.disable(); await obar._styleCleanup;
            assert(!Main.panel.has_style_class_name('openbar'), `rapid cycle ${cycle}: final panel class removed`);
        } finally { io.restore(); }
    }
    restored('final rapid cycle');
    assert(obar._paletteCounts === null, 'session-only palette populations cleared');
    settings.disconnect(reloadId);
    obar.enable();
    await until(() => obar._paletteCounts?.dark?.some(n => n > 0) && obar._paletteCounts?.light?.some(n => n > 0), 'both mode populations');
    assert(true, 'saved nonempty URI refreshes both mode populations');
    obar.disable(); await obar._styleCleanup;
    assert(obar._settings === null, 'final settings released');
    await Scripting.sleep(500);
}
