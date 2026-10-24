// Run only under reports-run.sh: private HOME/config and headless Wayland.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
const dir = GLib.getenv('OPENBAR_TEST_DIR');
const path = `${dir}/openbar@neuromorph`;
const loop = new GLib.MainLoop(null, false);
const sleep = ms => new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => { resolve(); return GLib.SOURCE_REMOVE; }));
function assert(ok, message) { if (!ok) throw Error(message); print(`PASS ${message}`); }
function read() { return new TextDecoder().decode(GLib.file_get_contents(`${GLib.get_user_config_dir()}/gtk-4.0/gtk.css`)[1]); }
async function test() {
    const fresh = GLib.getenv('OPENBAR_GTK_FRESH') === '1';
    let settings, intSettings, obar, save;
    if (!fresh) {
        ({saveGtkCss: save} = await import(`file://${path}/stylesheets.js`));
        const source = Gio.SettingsSchemaSource.new_from_directory(`${path}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
        settings = new Gio.Settings({settings_schema: source.lookup('org.gnome.shell.extensions.openbar', true)});
        intSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
        settings.set_boolean('apply-gtk', true);
        settings.set_int('window-hint', 0);
        settings.set_strv('mscolor', ['1', '0', '0']);
        intSettings.set_string('color-scheme', 'default');
        obar = {_settings: settings, _intSettings: intSettings};
        save(obar, 'enable');
        for (let i = 0; i < 100; i++) {
            try { if (read().includes('accent_color rgba(255, 0, 0')) break; } catch (_) {}
            await sleep(30);
        }
        assert(read().includes('accent_color rgba(255, 0, 0'), 'actual saveGtkCss red write completed before Gtk.init');
    }
    Gtk.init();
    const window = new Gtk.Window();
    const label = new Gtk.Label({label: 'Real application CSS provider'});
    window.set_child(label);
    window.present();
    await sleep(400);
    const color = name => { const [found, rgba] = label.get_style_context().lookup_color(name); assert(found, `${name} resolves in application provider`); return rgba.to_string(); };
    const before = {accent: color('accent_color'), background: color('window_bg_color')};
    if (fresh) {
        assert(before.accent === 'rgb(0,0,255)', 'new process sees rewritten blue accent');
        assert(before.background === 'rgb(32,32,32)', 'new process sees rewritten dark background');
        GLib.file_set_contents(`${dir}/gtk-fresh-result.json`, JSON.stringify({gtk: `${Gtk.get_major_version()}.${Gtk.get_minor_version()}.${Gtk.get_micro_version()}`, before}));
        window.destroy();
        return;
    }
    assert(before.accent === 'rgb(255,0,0)', 'running app initially loads red user CSS');
    assert(before.background === 'rgb(250,250,250)', 'running app initially loads light user CSS');
    settings.set_strv('mscolor', ['0', '0', '1']);
    intSettings.set_string('color-scheme', 'prefer-dark');
    save(obar, 'enable');
    for (let i = 0; i < 100; i++) { if (read().includes('accent_color rgba(0, 0, 255')) break; await sleep(30); }
    assert(read().includes('accent_color rgba(0, 0, 255'), 'actual saveGtkCss blue write completed');
    assert(read().includes('window_bg_color rgba(32, 32, 32'), 'actual saveGtkCss dark write completed');
    await sleep(1600);
    // Change GTK's application-side dark preference too, without a desktop portal.
    Gtk.Settings.get_default().gtk_application_prefer_dark_theme = true;
    await sleep(400);
    const after = {accent: color('accent_color'), background: color('window_bg_color')};
    assert(after.accent === before.accent, 'running provider retains old accent after file replacement');
    assert(after.background === before.background, 'running provider retains old light background despite app dark preference');
    const provider = new Gtk.CssProvider();
    provider.load_from_path(`${GLib.get_user_config_dir()}/gtk-4.0/gtk.css`);
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER + 1);
    await sleep(200);
    assert(color('accent_color') === 'rgb(0,0,255)', 'application-owned explicit reload reads blue accent');
    assert(color('window_bg_color') === 'rgb(32,32,32)', 'application-owned explicit reload reads dark background');
    GLib.file_set_contents(`${dir}/gtk-result.json`, JSON.stringify({gtk: `${Gtk.get_major_version()}.${Gtk.get_minor_version()}.${Gtk.get_micro_version()}`, before, after, explicitReload: true}));
    window.destroy();
}
test().catch(e => { logError(e); GLib.file_set_contents(`${dir}/gtk-error`, String(e)); }).finally(() => loop.quit());
loop.run();
