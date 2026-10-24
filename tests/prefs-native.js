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
        const preserveLabel = descendants(window).find(widget =>
            widget instanceof Gtk.Label && widget.get_label() === 'Preserve custom WindowMax background');
        assert(!!preserveLabel, 'custom WindowMax preservation option is exposed in preferences');
        const preserveGrid = preserveLabel.get_parent();
        const [column, row] = preserveGrid.query_child(preserveLabel);
        const preserveSwitch = preserveGrid.get_child_at(column + 1, row);
        settings.set_boolean('autotheme-preserve-wmax', true);
        assert(preserveSwitch instanceof Gtk.Switch && preserveSwitch.active,
            'custom WindowMax option reflects its schema setting');
        preserveSwitch.active = false;
        assert(!settings.get_boolean('autotheme-preserve-wmax'),
            'custom WindowMax preference updates its schema setting');
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
    // A caller can destroy an unpresented window after construction.
    const unpresented = new Adw.PreferencesWindow();
    const early = new OpenbarPrefs();
    early.fillOpenbarPrefs(unpresented, extension);
    unpresented.destroy(); await sleep(30);
    assert(!early.cssProvider && early._settingsSignals.length === 0, 'destroy before realize releases all preferences resources');
    const prefs = new OpenbarPrefs();
    const window = new Adw.PreferencesWindow();
    const load = prefs.loadQuotesFromFile;
    prefs.loadQuotesFromFile = () => {throw Error('partial initialization');};
    let failed = false;
    try {prefs.fillOpenbarPrefs(window, extension);} catch (_) {failed = true;}
    assert(failed && !prefs.cssProvider, 'partial initialization releases provider');
    prefs.loadQuotesFromFile = load;
    window.destroy();
    const late = new OpenbarPrefs();
    const lateWindow = new Adw.PreferencesWindow();
    late.createColorWidget = () => {throw Error('late UI initialization failure');};
    try {late.fillOpenbarPrefs(lateWindow, extension);} catch (_) { /* expected */ }
    assert(!late.cssProvider && late._uiTimeouts.size === 0 && connections.every(([s, id]) => !GObject.signal_handler_is_connected(s, id)), 'late partial initialization disconnects live handlers and quote timer');
    lateWindow.destroy();
    Gio.Settings.prototype.connect = originalConnect;
}
async function serviceLifetime() {
    const {ExtensionsService, extensionManager} = await import('resource:///org/gnome/Shell/Extensions/js/extensionsService.js');
    const {serializeExtension} = await import('resource:///org/gnome/Shell/Extensions/js/misc/extensionUtils.js');
    const serialized = serializeExtension(extensionManager.lookup('openbar@neuromorph'));
    const service = new ExtensionsService();
    // Only fixture discovery is substituted: actual dialog construction, handler
    // order, hold/release and the native two-second shutdown policy are untouched.
    service._proxy.GetExtensionInfoAsync = async () => [serialized];
    let prefs;
    const build = OpenbarPrefs.prototype._buildOpenbarPrefs;
    OpenbarPrefs.prototype._buildOpenbarPrefs = function (...args) {
        prefs = this;
        return build.apply(this, args);
    };
    let settled = false, shutdown = false;
    service.connect('shutdown', () => {
        shutdown = true;
        if (!settled) {
            printerr(`FAIL actual ExtensionsService shutdown before transaction completion: import-export=${settings.get_boolean('import-export')}`);
            // Match the production service: no extra harness loop rescues callbacks.
            imports.system.exit(1);
        }
    });
    await service.OpenExtensionPrefsAsync(['openbar@neuromorph', '', {}], {
        return_value() {}, return_gerror(e) {throw e;}, return_dbus_error(_n, m) {throw Error(m);},
    });
    const window = service._prefsDialog;
    await new Promise(resolve => window.connect('loaded', resolve));
    OpenbarPrefs.prototype._buildOpenbarPrefs = build;
    assert(!window.get_application() && !Gio.Application.get_default(), 'actual service dialog has no GApplication');
    const failing = GLib.getenv('OPENBAR_PREFS_MODE') === 'service-error';
    const file = Gio.File.new_for_path(`${dir}/service-import.ini`);
    GLib.file_set_contents(file.get_path(), '[/]\nheight=43.0\n');
    settings.set_double('height', 29);
    settings.set_boolean('import-export', false);
    settings.set_boolean('pause-reload', false);
    Gio.Settings.sync();
    const reload = settings.get_boolean('trigger-reload');
    let entered;
    const entry = new Promise(resolve => {entered = resolve;});
    const spawn = Gio.Subprocess.new;
    const communicate = Gio.Subprocess.prototype.communicate_utf8_async;
    let childDone = false;
    Gio.Subprocess.new = (argv, flags) => spawn(['sh', '-c', failing ? 'sleep 5; printf child-failed >&2; exit 23' : 'sleep 5; exec "$@"', 'openbar-delayed-dconf', ...argv], flags);
    Gio.Subprocess.prototype.communicate_utf8_async = function (input, cancellable, callback) {
        communicate.call(this, input, cancellable, (p, result) => {
            childDone = true;
            GLib.timeout_add(0, 150, () => {callback(p, result); return GLib.SOURCE_REMOVE;});
        });
        entered();
    };
    // Preserve a preblocked third-party handler without accidentally unblocking it.
    let blockedCalls = 0;
    const preblocked = window.connect('close-request', () => {blockedCalls++; return false;});
    window.block_signal_handler(preblocked);
    let closeCalls = 0;
    window.connect('close-request', () => {closeCalls++; return false;});
    const started = GLib.get_monotonic_time();
    // Attach the failure observer immediately so the test itself has no unhandled rejection.
    const pending = prefs._importSettingsFile(file).then(() => null, error => error);
    await entry;
    assert(settings.get_boolean('import-export') && !childDone, 'real slow dconf child entered under transaction pause');
    window.close();
    window.close();
    await sleep(3500);
    assert(!shutdown && !childDone && settings.get_boolean('import-export'), 'user close cannot release service while real child is pending past idle timeout');
    assert(service._prefsDialog === window && !prefs._closed, 'close is deferred without losing host dialog tracking or UI ownership');
    const error = await pending;
    settled = true;
    Gio.Subprocess.new = spawn;
    Gio.Subprocess.prototype.communicate_utf8_async = communicate;
    assert(GLib.get_monotonic_time() - started > 5000000 && childDone, 'slow real child and delayed completion are awaited');
    assert(failing ? String(error).includes('child-failed') : error === null, 'real child failure is propagated instead of silently discarded');
    assert(settings.get_double('height') === (failing ? 29 : 43) && !settings.get_boolean('import-export') && !settings.get_boolean('pause-reload'), 'real child outcome persists and both pause flags restore before service exit');
    assert((settings.get_boolean('trigger-reload') !== reload) === !failing, 'only successful deferred-close import emits final reload');
    assert(closeCalls === 1 && blockedCalls === 0, 'repeated close replays handlers once and preserves previously blocked handlers');
    assert(!service._prefsDialog && prefs._closed && !prefs.cssProvider && prefs._settingsSignals.length === 0, 'deferred close replays host release once and cleans preferences resources');
    await sleep(4000);
    assert(shutdown, 'actual service auto-shuts down normally after completed deferred close');
    const dump = Gio.Subprocess.new(['dconf', 'read', '/org/gnome/shell/extensions/openbar/import-export'], Gio.SubprocessFlags.STDOUT_PIPE);
    const [, stdout] = dump.communicate_utf8(null, null);
    assert(dump.get_successful() && stdout.trim() === 'false', 'separate real dconf reader sees durable restored pause');
}
async function transactions() {
    const prefs = new OpenbarPrefs();
    const app = new Adw.Application({application_id: 'org.example.OpenbarPrefsRegression', flags: Gio.ApplicationFlags.NON_UNIQUE});
    app.register(null);
    const window = new Adw.PreferencesWindow({application: app});
    prefs.fillOpenbarPrefs(window, extension);
    let holds = 0, releases = 0;
    const hold = app.hold.bind(app), releaseApp = app.release.bind(app);
    app.hold = () => {holds++; hold();};
    app.release = () => {releases++; releaseApp();};
    const s = prefs._settings;
    const chooserClass = Gtk.FileChooserDialog;
    let dialog;
    Gtk.FileChooserDialog = class {
        constructor() {dialog = this;}
        add_button() {} connect(_signal, cb) {this.callback = cb;}
        get_file() {return Gio.File.new_for_path(`${dir}/missing/export.ini`);}
        show() {} destroy() {this.destroyed = true;}
    };
    const errors = [];
    prefs._reportSettingsError = (_window, error) => errors.push(String(error));
    s.set_boolean('import-export', false);
    prefs.exportSettings(window);
    try {await dialog.callback(dialog, Gtk.ResponseType.ACCEPT);} catch (_) { /* old source throws */ }
    assert(!s.get_boolean('import-export'), 'export file failure restores pause in finally');
    assert(errors.length === 1 && dialog.destroyed, 'export error reported and chooser destroyed');
    // Cancellation never acquires a pause, including an existing external pause.
    s.set_boolean('import-export', true);
    prefs.importSettings(window);
    await dialog.callback(dialog, Gtk.ResponseType.CANCEL);
    assert(s.get_boolean('import-export') && dialog.destroyed, 'chooser cancellation preserves preexisting pause');
    s.set_boolean('import-export', false);
    Gtk.FileChooserDialog = chooserClass;
    const file = Gio.File.new_for_path(`${dir}/export.ini`);
    for (const paused of [false, true]) {
        s.set_boolean('pause-reload', paused);
        await prefs._exportSettingsFile(file);
        const contents = new TextDecoder().decode(file.load_contents(null)[1]);
        assert(!contents.includes('import-export=') && !contents.includes('pause-reload='), 'export omits both transient flags');
        assert(s.get_boolean('pause-reload') === paused && !s.get_boolean('import-export'), 'export preserves prior pause values');
        assert(contents.includes('height=') && contents.includes('bguri='), 'export includes default settings without mutating all keys');
    }
    s.set_boolean('pause-reload', false);
    await prefs._importSettingsFile(file);
    assert(!s.get_boolean('import-export'), 'full exported schema snapshot imports through real dconf');
    const imported = Gio.File.new_for_path(`${dir}/import.ini`);
    GLib.file_set_contents(imported.get_path(), "[/]\nheight=37.0\nimport-export=true\npause-reload=true\nbguri='foreign'\ndark-bguri='foreign-dark'\nlight-bguri='foreign-light'\n");
    const wallpaper = ['bguri', 'dark-bguri', 'light-bguri'];
    wallpaper.forEach((key, i) => s.set_string(key, `file:///private/local-${i}.png`));
    Gio.Settings.sync();
    const before = s.get_boolean('trigger-reload');
    await prefs._importSettingsFile(imported);
    await sleep(60);
    assert(s.get_double('height') === 37, 'real private dconf load completed before promise resolves');
    assert(wallpaper.every((key, i) => s.get_string(key) === `file:///private/local-${i}.png`), 'all three local wallpaper URIs preserved');
    assert(!s.get_boolean('import-export') && !s.get_boolean('pause-reload') && s.get_boolean('trigger-reload') !== before, 'import restores pauses and reloads only after completion');
    const rejected = async (operation, message) => {let caught = false; try {await operation();} catch (_) {caught = true;} assert(caught && !s.get_boolean('import-export'), message);};
    await rejected(() => prefs._importSettingsFile(Gio.File.new_for_path(`${dir}/absent.ini`)), 'missing import file rejects and unpauses');
    await rejected(() => prefs._exportSettingsFile(null), 'null selection rejects without pause');
    const snapshot = prefs._settingsSnapshot;
    prefs._settingsSnapshot = () => {throw Error('synchronous snapshot failure');};
    await rejected(() => prefs._exportSettingsFile(file), 'synchronous snapshot failure restores pause');
    prefs._settingsSnapshot = snapshot;
    GLib.file_set_contents(imported.get_path(), "[/]\nheight='bad type'\n");
    await rejected(() => prefs._importSettingsFile(imported), 'invalid variant rejects before dconf mutation');
    const sync = Gio.Settings.sync;
    Gio.Settings.sync = () => {throw Error('synchronous backend flush failure');};
    await rejected(() => prefs._exportSettingsFile(file), 'synchronous backend sync failure releases pause and transaction ownership');
    Gio.Settings.sync = sync;
    await prefs._exportSettingsFile(file);
    const spawn = Gio.Subprocess.new;
    Gio.Subprocess.new = () => {throw Error('synchronous spawn failure');};
    GLib.file_set_contents(imported.get_path(), "[/]\nheight=38.0\n");
    await rejected(() => prefs._importSettingsFile(imported), 'synchronous subprocess failure restores pause');
    Gio.Subprocess.new = (argv, flags) => spawn(['sh', '-c', 'printf child-failed >&2; exit 23'], flags);
    await rejected(() => prefs._importSettingsFile(imported), 'real child nonzero status rejects and reaps');
    Gio.Subprocess.new = spawn;
    // Hold delivery of a real child result, not a synthetic success, to force close/overlap.
    let release, entered;
    const entry = new Promise(resolve => entered = resolve);
    const communicate = Gio.Subprocess.prototype.communicate_utf8_async;
    Gio.Subprocess.prototype.communicate_utf8_async = function (input, cancellable, callback) {
        communicate.call(this, input, cancellable, (p, result) => {
            release = () => callback(p, result);
            entered();
        });
    };
    const active = prefs._importSettingsFile(imported);
    await entry;
    assert(s.get_boolean('import-export'), 'pause remains held until real child completion delivered');
    let overlap = false;
    try {await prefs._exportSettingsFile(file);} catch (_) {overlap = true;}
    assert(overlap && s.get_boolean('import-export'), 'overlapping export rejected without releasing import owner');
    const messageDialog = Gtk.MessageDialog;
    let resetDialog;
    Gtk.MessageDialog = class {
        constructor() {resetDialog = this;}
        add_button() {} set_default_response() {} show() {}
        connect(_signal, cb) {this.callback = cb;}
        destroy() {this.destroyed = true;}
    };
    prefs.resetSettingsDialog(window);
    await resetDialog.callback(resetDialog, Gtk.ResponseType.YES);
    assert(s.get_boolean('import-export') && errors.length === 2 && resetDialog.destroyed, 'overlapping reset reports error without releasing import pause');
    Gtk.MessageDialog = messageDialog;
    window.present(); await sleep(30); window.destroy();
    release(); await active;
    Gio.Subprocess.prototype.communicate_utf8_async = communicate;
    assert(!s.get_boolean('import-export') && s.get_double('height') === 38, 'close does not abandon successful in-flight import or restoration');
    assert(holds > 0 && holds === releases, 'application held through transactions and balanced on all outcomes');
    const config = GLib.getenv('XDG_CONFIG_HOME');
    assert(config.startsWith(dir) && Gio.File.new_for_path(`${config}/dconf/user`).query_exists(null), 'real dconf database exists only in disposable private config');
}
async function layout() {
    Gtk.Settings.get_default().gtk_xft_dpi = 120 * 1024;
    const window = new Adw.PreferencesWindow();
    extension.fillPreferencesWindow(window);
    window.present(); await sleep(350);
    const stack = descendants(window).find(w => w instanceof Gtk.Stack && w.get_child_by_name('gtkflatpak'));
    const scroll = descendants(window).find(w => w instanceof Gtk.ScrolledWindow && w.has_css_class('openbar-scroll'));
    stack.set_visible_child_name('gtkflatpak'); await sleep(500);
    const stackBox = descendants(window).find(w => w.has_css_class('openbar-stack-box'));
    const [hasBounds, stackBounds] = stackBox.compute_bounds(window);
    assert(hasBounds && stackBounds.get_x() >= 0 && stackBounds.get_x() + stackBounds.get_width() <= window.get_width(), '125% text stack region fits inside the window');
    print(JSON.stringify({stackWidth: stack.get_allocated_width(), minimum: stack.measure(Gtk.Orientation.HORIZONTAL, -1), scrollWidth: scroll.get_width(), scrollUpper: scroll.get_hadjustment().upper, window: window.get_width()}));
    assert(stack.get_allocated_width() >= stack.measure(Gtk.Orientation.HORIZONTAL, -1)[0], '125% text content never allocated below native minimum');
    assert(scroll.get_policy()[0] === Gtk.PolicyType.AUTOMATIC, 'oversized native controls have horizontal-scroll fallback');
    print(JSON.stringify(descendants(window).filter(w => w.has_css_class('openbar-sidebar') || w.has_css_class('openbar-scroll')).map(w => ({type: w.constructor.name, min: w.measure(Gtk.Orientation.HORIZONTAL, -1), width:w.get_allocated_width()}))));
    const measurements = [];
    for (const width of [820, 640]) {
        window.set_default_size(width, 600); await sleep(400);
        print(JSON.stringify({requested:width, actual:window.get_width(), min:window.measure(Gtk.Orientation.HORIZONTAL,-1)}));
        assert(window.get_width() <= width, `preferences can shrink to ${width}px`);
        for (let i = 0; i < stack.get_pages().get_n_items(); i++) {
            const page = stack.get_pages().get_item(i);
            stack.set_visible_child(page.child);
            // Wait for native size allocation, not one arbitrary 35ms frame.
            // Multiple isolated compositors may be running during integration.
            let minimum, adjustment;
            for (let frame = 0; frame < 60; frame++) {
                await sleep(20);
                minimum = stack.measure(Gtk.Orientation.HORIZONTAL, -1)[0];
                adjustment = scroll.get_hadjustment();
                if (stack.get_allocated_width() >= minimum &&
                    adjustment.upper >= stack.get_allocated_width() - 1)
                    break;
            }
            measurements.push({width: window.get_width(), page: page.name, allocated: stack.get_allocated_width(), minimum, upper: adjustment.upper, viewport: adjustment.page_size});
            assert(stack.get_allocated_width() >= minimum && adjustment.upper >= stack.get_allocated_width() - 1, `native ${page.name} controls reachable at ${width}px`);
        }
        for (const css of ['openbar-titlegrid', 'openbar-quotebox', 'openbar-stack-box']) {
            const widget = descendants(window).find(w => w.has_css_class(css));
            const [ok, bounds] = widget.compute_bounds(window);
            assert(ok && bounds.get_x() >= -1 && bounds.get_x() + bounds.get_width() <= window.get_width() + 1, `${css} stays inside window at ${width}px`);
        }
    }
    GLib.file_set_contents(`${dir}/layout.json`, JSON.stringify(measurements, null, 2));
    window.destroy();
}
async function main() {
    await setup();
    print(`GTK ${Gtk.get_major_version()}.${Gtk.get_minor_version()}.${Gtk.get_micro_version()}`);
    settings.set_int('monitor-width', 1024); settings.set_int('monitor-height', 768);
    if (GLib.getenv('OPENBAR_PREFS_MODE').startsWith('service')) await serviceLifetime();
    else if (GLib.getenv('OPENBAR_PREFS_MODE') === 'transactions') await transactions();
    else if (GLib.getenv('OPENBAR_PREFS_MODE') === 'layout') await layout();
    else await lifecycle();
    print('PASS preferences native regression complete');
}
const loop = new GLib.MainLoop(null, false);
main().catch(e => {logError(e); imports.system.exitCode = 1;}).finally(() => loop.quit());
loop.run();
