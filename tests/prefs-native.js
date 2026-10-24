import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk?version=4.0';
import Adw from 'gi://Adw';
Gio.Resource.load(GLib.getenv('OPENBAR_PREFS_RESOURCE'))._register();
Adw.init();
const dir = GLib.getenv('OPENBAR_PREFS_DIR');
const path = `${dir}/gnome-shell/extensions/openbar@neuromorph`;
let Preferences, OpenbarPrefs;
async function setup() {
({default: Preferences, OpenbarPrefs} = await import(`file://${path}/prefs.js`));
const meta = {...JSON.parse(new TextDecoder().decode(GLib.file_get_contents(`${path}/metadata.json`)[1])), path, dir: Gio.File.new_for_path(path)};
extension = new Preferences(meta);
const {extensionManager} = await import('resource:///org/gnome/Shell/Extensions/js/extensionsService.js');
const {serializeExtension} = await import('resource:///org/gnome/Shell/Extensions/js/misc/extensionUtils.js');
extensionManager.createExtensionObject(serializeExtension({metadata: meta, path, type: 2, state: 1, enabled: true, error: '', hasPrefs: true, hasUpdate: false, canChange: true, sessionModes: ['user']})).stateObj = extension;
settings = extension.getSettings();
}
let extension, settings;
const sleep = ms => new Promise(resolve => GLib.timeout_add(0, ms, () => {resolve(); return GLib.SOURCE_REMOVE;}));
function assert(ok, message) { if (!ok) throw Error(message); print(`PASS ${message}`); }
const descendants = w => {const all = [w]; for (let c = w.get_first_child(); c; c = c.get_next_sibling()) all.push(...descendants(c)); return all;};
async function lifecycle() {
    const originalConnect = Gio.Settings.prototype.connect;
    const connections = [];
    Gio.Settings.prototype.connect = function (signal, callback) {const id = originalConnect.call(this, signal, callback); connections.push([this, id]); return id;};
    for (let cycle = 0; cycle < 2; cycle++) {
        const prefs = new OpenbarPrefs();
        const window = new Adw.PreferencesWindow();
        prefs.fillOpenbarPrefs(window, extension);
        window.present(); await sleep(100);
        let paletteCalls = 0;
        prefs.updatePalette = () => paletteCalls++;
        prefs.triggerBackgroundPalette(window);
        prefs.setTimeoutStyleReload();
        const reload = settings.get_boolean('trigger-reload');
        const provider = prefs.cssProvider;
        let removals = 0;
        const remove = Gtk.StyleContext.remove_provider_for_display;
        Gtk.StyleContext.remove_provider_for_display = (display, p) => {if (p === provider) removals++; remove(display, p);};
        window.destroy();
        Gtk.StyleContext.remove_provider_for_display = remove;
        assert(connections.length >= 75 && connections.every(([s, id]) => !GObject.signal_handler_is_connected(s, id)), 'all explicit settings handlers disconnected on destroy');
        assert(removals === 1 && !prefs.cssProvider, 'display CSS provider removed exactly once');
        const calls = paletteCalls;
        settings.set_boolean('bg-change', !settings.get_boolean('bg-change'));
        await sleep(550);
        assert(paletteCalls === calls, 'no closed-widget palette or timeout callbacks');
        assert(settings.get_boolean('trigger-reload') === reload, 'no pending style reload after close');
    }
    const prefs = new OpenbarPrefs();
    const window = new Adw.PreferencesWindow();
    const load = prefs.loadQuotesFromFile;
    prefs.loadQuotesFromFile = () => {throw Error('partial initialization');};
    let failed = false;
    try {prefs.fillOpenbarPrefs(window, extension);} catch (_) {failed = true;}
    assert(failed && !prefs.cssProvider, 'partial initialization releases provider');
    prefs.loadQuotesFromFile = load;
    window.destroy();
}
async function main() {
    await setup();
    print(`GTK ${Gtk.get_major_version()}.${Gtk.get_minor_version()}.${Gtk.get_micro_version()}`);
    settings.set_int('monitor-width', 1024); settings.set_int('monitor-height', 768);
    await lifecycle();
    print('PASS preferences native regression complete');
}
const loop = new GLib.MainLoop(null, false);
main().catch(e => {logError(e); imports.system.exitCode = 1;}).finally(() => loop.quit());
loop.run();
