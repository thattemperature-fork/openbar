// Isolated historical-report probes, not a physical suspend or GPU test.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
const dir = GLib.getenv('OPENBAR_TEST_DIR');
const results = [];
function assert(ok, message) { if (!ok) throw Error(message); print(`PASS ${message}`); }
const sleep = Scripting.sleep;
function descendants(actor) { return [actor, ...actor.get_children().flatMap(descendants)]; }
function ancestry(actor) { const classes = []; for (let a = actor; a; a = a.get_parent()) classes.push(a.get_style_class_name?.() ?? a.constructor.name); return classes; }
function state(obar, label) {
    const qs = Main.panel.statusArea.quickSettings;
    const sliders = descendants(qs.menu.box).filter(a => a.has_style_class_name?.('slider'));
    const snapshot = {label, panelClass: Main.panel.get_style_class_name(), panelStyle: Main.panel.get_style(), panelY: Main.layoutManager.panelBox.y, isObarReset: obar.isObarReset, pause: obar._settings.get_boolean('pause-reload'), loaded: obar.themeContext.get_theme().get_custom_stylesheets().map(f => f.get_path()), sliders: sliders.map(a => ({classes: a.get_style_class_name(), parent: a.get_parent()?.get_style_class_name(), ancestry: ancestry(a), active: a.get_theme_node().get_color('-barlevel-active-background-color').to_string(), background: a.get_theme_node().get_color('-barlevel-background-color').to_string()}))};
    results.push(snapshot); print(JSON.stringify(snapshot));
    assert(snapshot.panelClass.includes('openbar'), `${label}: panel retains openbar`);
    assert(snapshot.loaded.some(p => p.endsWith('/stylesheet.css')), `${label}: generated stylesheet loaded`);
    assert(snapshot.sliders.length > 0, `${label}: native quick-settings sliders exist`);
    return snapshot;
}
export async function run() { await new Promise(() => {}); }
export function init() { GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => { test().then(() => GLib.file_set_contents(`${dir}/result`, `PASS reports Shell ${Config.PACKAGE_VERSION}\n`)).catch(e => logError(e)).finally(() => { GLib.file_set_contents(`${dir}/shell-result.json`, JSON.stringify(results, null, 2)); global.context.terminate(); }); return GLib.SOURCE_REMOVE; }); }
async function test() {
    await sleep(1000);
    // Real GTK application subprocess connects only to this private Wayland socket.
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE});
    launcher.setenv('WAYLAND_DISPLAY', GLib.getenv('WAYLAND_DISPLAY'), true);
    for (const fresh of GLib.getenv('REPORTS_SKIP_GTK') === '1' ? [] : ['0', '1']) {
        launcher.setenv('OPENBAR_GTK_FRESH', fresh, true);
        const proc = launcher.spawnv([GLib.getenv('REPORTS_GJS'), '-m', `${GLib.getenv('REPORTS_REPO')}/tests/reports-gtk-provider.js`]);
        const [ok, stdout] = await new Promise((resolve, reject) => proc.communicate_utf8_async(null, null, (p, res) => { try { resolve(p.communicate_utf8_finish(res)); } catch (e) { reject(e); } }));
        print(stdout); GLib.file_set_contents(`${dir}/gtk-${fresh}.log`, stdout);
        assert(ok && proc.get_successful() && !Gio.File.new_for_path(`${dir}/gtk-error`).query_exists(null), `GTK child ${fresh} completed`);
    }
    const path = `${dir}/openbar@neuromorph`;
    if (GLib.getenv('REPORTS_EARLY_FIX') === '1') {
        // Experimental relocation in the disposable copy only; production untouched.
        const file = `${path}/extension.js`;
        let text = new TextDecoder().decode(GLib.file_get_contents(file)[1]);
        const start = text.indexOf('        // OpenBar runtime directory');
        const end = text.indexOf("        // Add 'openbar' class", start);
        assert(start > 0 && end > start, 'runtime initialization block identified');
        const block = text.slice(start, end);
        text = text.slice(0, start) + text.slice(end);
        const before = text.indexOf('        // Set initial bguri as per color-scheme');
        assert(before > 0, 'early mode-change site identified');
        text = text.slice(0, before) + block + text.slice(before);
        GLib.file_set_contents(file, text);
    }
    const {default: Openbar} = await import(`file://${path}/extension.js`);
    const metadata = {...JSON.parse(new TextDecoder().decode(GLib.file_get_contents(`${path}/metadata.json`)[1])), path, dir: Gio.File.new_for_path(path)};
    const bg = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
    function wallpaper(n, color) { const pix = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 48, 48); pix.fill(color); const p = `${dir}/wallpaper-${n}.png`; pix.savev(p, 'png', [], []); const uri = Gio.File.new_for_path(p).get_uri(); bg.set_string('picture-uri', uri); bg.set_string('picture-uri-dark', uri); }
    wallpaper(0, 0x5380b0ff);
    await sleep(500);
    const obar = new Openbar(metadata);
    // Avoid unrelated GTK override ownership changes; GTK was separately tested.
    const source = Gio.SettingsSchemaSource.new_from_directory(`${path}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
    const settings = new Gio.Settings({settings_schema: source.lookup('org.gnome.shell.extensions.openbar', true)});
    settings.set_boolean('apply-gtk', false);
    settings.set_boolean('apply-flatpak', false);
    if (GLib.getenv('REPORTS_EARLY_MODE') === '1') {
        settings.set_string('bguri', bg.get_string('picture-uri'));
        settings.set_string('color-scheme', 'default');
        new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}).set_string('color-scheme', 'prefer-dark');
        obar.enable();
        await sleep(6500);
        state(obar, 'mode-changed-while-disabled');
        assert(settings.get_string('color-scheme') === 'prefer-dark', 'enable detected color-scheme changed while disabled');
        obar.disable();
        await sleep(6500);
        return; // Runner must reject logged Open Bar errors, even with this marker.
    }
    obar.enable();
    for (const key of ['autotheme-refresh', 'auto-bgalpha', 'autofg-bar', 'autofg-menu', 'smbgoverride']) settings.set_boolean(key, true);
    settings.set_string('autotheme-dark', 'Pastel');
    settings.set_string('autotheme-light', 'Light');
    await sleep(6500);
    const first = state(obar, 'before-wallpaper');
    let previous = first;
    for (const [i, color] of [[1, 0xb05030ff], [2, 0x40a060ff]]) {
        wallpaper(i, color); await sleep(6500);
        const current = state(obar, `wallpaper-${i}`);
        print(`OBSERVATION wallpaper-${i}: active-color changed=${current.sliders.every((s, j) => s.active !== previous.sliders[j].active)}`);
        assert(current.sliders.every(s => s.ancestry.some(c => c.split(' ').includes('openmenu'))), `wallpaper-${i}: native slider retains styled ancestor`);
        previous = current;
    }
    // Tagged GNOME loadTheme() preserves custom stylesheets: test the native path,
    // rather than assuming wallpaper changes always discard extension CSS.
    Main.loadTheme();
    await sleep(300);
    state(obar, 'after-shell-loadTheme');
    // More than the old 8/modern 16 candy limit; remove real panel indicators
    // during session transition to exercise native style cache invalidation.
    const indicators = [];
    for (let i = 0; i < 17; i++) {
        const indicator = new PanelMenu.Button(0, `reports-${i}`);
        indicator.add_child(new St.Label({text: `${i}`}));
        Main.panel.addToStatusArea(`reports-${i}`, indicator);
        indicators.push(indicator);
    }
    await sleep(300);
    // Controlled disable/mode-switch/enable: this is not ExtensionManager rebasing
    // or a physical lock/resume and does not model all concurrent actor removal.
    for (const [bartype, candy] of [['Trilands', false], ['Islands', true]]) {
        settings.set_string('bartype', bartype);
        settings.set_boolean('candybar', candy);
        settings.set_boolean('shadow', true);
        // Deliberate repeated candy colors; not a claim that these cause the bug.
        settings.set_strv('candy1', ['0.3', '0.5', '0.7']);
        settings.set_strv('candy2', ['0.3', '0.5', '0.7']);
        await sleep(1500);
        state(obar, `pre-session-${bartype}-${candy}`);
        obar.disable();
        Main.sessionMode.pushMode('unlock-dialog');
        for (const indicator of indicators) { const parent = indicator.container.get_parent(); if (parent) parent.remove_child(indicator.container); }
        await sleep(500);
        Main.sessionMode.popMode('unlock-dialog');
        for (const indicator of indicators) Main.panel._rightBox.add_child(indicator.container);
        await sleep(500);
        obar.enable();
        await sleep(6500);
        state(obar, `post-session-${bartype}-${candy}`);
    }
    // Exercise repeated unload/reload with real native shadow/theme-node reads.
    const actor = new St.Widget({style_class: 'reports-shadow', width: 32, height: 32});
    Main.uiGroup.add_child(actor);
    const theme = obar.themeContext.get_theme();
    const css = Gio.File.new_for_path(`${dir}/shadow.css`);
    GLib.file_set_contents(css.get_path(), '.reports-shadow { background-color: red; box-shadow: 0 2px 5px 3px rgba(0,0,0,0.7); border-radius: 8px; }');
    for (let i = 0; i < 100; i++) {
        theme.load_stylesheet(css);
        assert(actor.get_theme_node().get_box_shadow() !== null, `native shadow ${i}`);
        theme.unload_stylesheet(css);
        actor.get_theme_node().get_box_shadow();
        if (i % 10 === 0) await sleep(20);
    }
    actor.destroy();
    obar.disable();
    for (const indicator of indicators) indicator.destroy();
    await sleep(6500);
    assert(!Main.panel.has_style_class_name('openbar'), 'final cleanup removed panel class');
}
