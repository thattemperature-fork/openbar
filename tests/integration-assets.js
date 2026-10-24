// Real lifecycle asset ordering and partial-enable failures in a private copy.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const dir = GLib.getenv('OPENBAR_TEST_DIR');
let count = 0;
function assert(value, label) { if (!value) throw Error(label); count++; print(`PASS ${label}`); }
export async function run() { await new Promise(() => {}); }
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        test().then(() => GLib.file_set_contents(`${dir}/result`, `PASS integration assets: ${count} assertions\n`))
            .catch(error => logError(error, 'integration assets failed')).finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
async function test() {
    await Scripting.sleep(1000);
    const path = `${dir}/openbar@neuromorph`;
    const {default: Openbar} = await import(`file://${path}/extension.js`);
    const Styles = await import(`file://${path}/stylesheets.js`);
    const metadata = {...JSON.parse(new TextDecoder().decode(GLib.file_get_contents(`${path}/metadata.json`)[1])), path, dir: Gio.File.new_for_path(path)};
    const image = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 32, 32);
    image.fill(0x5380b0ff); image.savev(`${dir}/wallpaper.png`, 'png', [], []);
    const uri = Gio.File.new_for_path(`${dir}/wallpaper.png`).get_uri();
    const background = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
    background.set_string('picture-uri', uri); background.set_string('picture-uri-dark', uri);
    await Scripting.sleep(500);
    const runtime = Gio.File.new_for_path(`${GLib.get_user_runtime_dir()}/io.github.neuromorph.openbar`);
    // Real directory creation failure before signal setup; teardown must be safe.
    GLib.file_set_contents(runtime.get_path(), 'blocking regular file');
    const partial = new Openbar(metadata);
    let threw = false;
    try { partial.enable(); } catch (_) { threw = true; }
    assert(threw, 'runtime creation failure surfaced');
    partial.disable(); await partial._styleCleanup;
    assert(!partial._settings && !partial._connections, 'runtime creation partial enable cleaned');
    runtime.delete(null);
    // Delay the callback of a real successful copy; no generated stylesheet may
    // publish before completion and all required static bytes must be available.
    const obar = new Openbar(metadata), settings = obar.getSettings();
    const copy = Gio.File.prototype.copy_async;
    let entered, retained, released = false;
    const started = new Promise(resolve => entered = resolve);
    Gio.File.prototype.copy_async = function(...args) {
        if (this.get_basename() !== 'menu.svg') return copy.apply(this, args);
        const result = copy.apply(this, args);
        entered();
        return result.then(value => new Promise(resolve => {
            if (released) resolve(value);
            else retained = () => resolve(value);
        }));
    };
    let reloads = 0;
    const id = settings.connect('changed::reloadstyle', () => reloads++);
    try {
        obar.enable(); await started; await Scripting.sleep(80);
        assert(reloads === 0, 'no stylesheet publication before actual static-copy completion');
        released = true; retained?.(); retained = null;
        await obar._runtimeAssetsReady;
        assert(await Styles.reloadStyle(obar, obar), 'stylesheet publishes after static copy');
        assert(new TextDecoder().decode(GLib.file_get_contents(`${runtime.get_path()}/assets/menu.svg`)[1]) === new TextDecoder().decode(GLib.file_get_contents(`${path}/media/assets/menu.svg`)[1]), 'static SVG bytes complete at publication');
        obar.disable(); await obar._styleCleanup;
    } finally { Gio.File.prototype.copy_async = copy; released = true; retained?.(); }
    // Force real destination failure after paths/signals exist; catch ownership
    // must report it, suppress CSS publication and permit disable/re-enable.
    const destination = runtime.get_child('assets').get_child('menu.svg');
    destination.delete(null); destination.make_directory(null);
    const failure = {_settings: settings,
        _intSettings: new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}),
        _hcSettings: new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.interface'}),
        obarRunDir: runtime, obarAssetsDir: runtime.get_child('assets'), path,
        main: Main, gnomeVersion: obar.gnomeVersion};
    Styles.beginStyleWrites(failure);
    failure._runtimeAssetsReady = Styles.prepareRuntimeAssets(failure);
    const assetFailure = failure._runtimeAssetsReady.then(() => false, () => true);
    const publication = Styles.reloadStyle(failure, failure).then(() => false, () => true);
    assert(await assetFailure, 'real destination copy failure rejects completion');
    assert(await publication, 'asset copy failure rejects dependent stylesheet publication');
    await Styles.invalidateStyleWrites(failure);
    destination.delete(null);
    obar.enable(); await obar._runtimeAssetsReady;
    assert(await Styles.reloadStyle(obar, obar), 're-enable recovers after asset failure');
    obar.disable(); await obar._styleCleanup;
    settings.disconnect(id);
    await Scripting.sleep(300);
}
