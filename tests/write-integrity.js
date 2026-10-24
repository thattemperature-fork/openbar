// Run only via run-write-tests.sh: all settings/files are disposable.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import * as Styles from '../openbar@neuromorph/stylesheets.js';

const root = GLib.getenv('OPENBAR_WRITE_TEST_DIR');
if (!root || !root.startsWith(`${GLib.getenv('TMPDIR')}/`))
    throw new Error('Disposable TMPDIR test root required');
const schema = Gio.SettingsSchemaSource.new_from_directory(`${root}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
function fixture(name) {
    const dir = `${root}/${name}`;
    GLib.mkdir_with_parents(`${dir}/assets`, 0o700);
    return {
        _settings: new Gio.Settings({settings_schema: schema.lookup('org.gnome.shell.extensions.openbar', false)}),
        _intSettings: {get_string: () => 'prefer-dark'},
        _hcSettings: {get_boolean: () => false},
        main: {sessionMode: {isLocked: false}}, gnomeVersion: 49,
        obarRunDir: Gio.File.new_for_path(dir), msSVG: true, mhSVG: true, smfgSVG: true, gtkCSS: true,
    };
}
function assert(value, message) {
    if (!value) throw new Error(message);
}
function read(path) { return new TextDecoder().decode(GLib.file_get_contents(path)[1]); }
const test = ARGV[0] ?? 'gtk-completion';
if (test === 'gtk-completion') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-gtk', true);
    const pending = Styles.saveGtkCss(obar, 'enable');
    assert(pending && typeof pending.then === 'function', 'GTK save must return a real completion promise');
    await pending;
    for (const version of [3, 4])
        assert(read(`${GLib.get_user_config_dir()}/gtk-${version}.0/gtk.css`).includes('Open Bar GTK CSS'), 'await must include GTK file close');
} else if (test === 'reload-completion') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-gtk', true);
    // Delay real SVG callback delivery so scheduling is not mistaken for completion.
    for (const method of ['replace_async', 'replace_contents_bytes_async']) {
        const original = Gio.File.prototype[method];
        Gio.File.prototype[method] = function (...args) {
            const callback = args[args.length - 1];
            if (this.get_path()?.endsWith('.svg') && typeof callback === 'function') {
                args[args.length - 1] = (object, result) => {
                    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 60, () => {
                        callback(object, result);
                        return GLib.SOURCE_REMOVE;
                    });
                };
            }
            return original.apply(this, args);
        };
    }
    let published = 0;
    obar._settings.connect('changed::reloadstyle', () => {
        for (const asset of ['calendar-today.svg', 'toggle-on.svg', 'toggle-on-hc.svg', 'checkbox-on.svg', 'checkbox-on-focused.svg', 'checkbox-off-focused.svg'])
            assert(read(`${obar.obarRunDir.get_path()}/assets/${asset}`).includes('<svg'), `reload before ${asset} close`);
        assert(read(`${GLib.get_user_config_dir()}/gtk-4.0/gtk.css`).includes('Open Bar GTK CSS'), 'reload before GTK close');
        published++;
    });
    await Styles.reloadStyle(obar, null);
    assert(published === 1, 'successful generation must publish once');
} else if (test === 'reload-failure') {
    const obar = fixture(test);
    Gio.File.new_for_path(`${obar.obarRunDir.get_path()}/stylesheet.css`).make_directory(null);
    let published = 0;
    obar._settings.connect('changed::reloadstyle', () => published++);
    let failed = false;
    try { await Styles.reloadStyle(obar, null); } catch (_) { failed = true; }
    assert(failed, 'write failure must reject');
    assert(published === 0, 'failed writes must not publish reload');
} else if (test === 'stale-disable') {
    const obar = fixture(test);
    let published = 0;
    obar._settings.connect('changed::reloadstyle', () => published++);
    const pending = Styles.reloadStyle(obar, null);
    assert(typeof Styles.invalidateStyleWrites === 'function', 'disable needs an invalidation hook');
    Styles.invalidateStyleWrites(obar);
    obar._settings = null;
    await pending;
    assert(published === 0, 'disable must not publish or access cleared settings');
} else if (test === 'active-disable') {
    const obar = fixture(test);
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const original = Gio.File.prototype.replace_contents_bytes_async;
    Gio.File.prototype.replace_contents_bytes_async = function (...args) {
        if (this.get_basename() === 'stylesheet.css') started();
        return original.apply(this, args);
    };
    let published = 0;
    obar._settings.connect('changed::reloadstyle', () => published++);
    const pending = Styles.reloadStyle(obar, null);
    await ready;
    Styles.invalidateStyleWrites(obar);
    obar._settings = null;
    await pending;
    await Styles.saveGtkCss(obar, 'disable');
    assert(published === 0, 'an active cancelled write must not publish');
} else if (test === 'latest-generation') {
    const obar = fixture(test);
    let published = 0;
    obar._settings.connect('changed::reloadstyle', () => published++);
    const a = Styles.reloadStyle(obar, null);
    obar._settings.set_strv('mscolor', ['1', '0', '0']);
    const b = Styles.reloadStyle(obar, null);
    obar._settings.set_strv('mscolor', ['0', '0', '1']);
    const c = Styles.reloadStyle(obar, null);
    await Promise.all([a, b, c]);
    assert(published === 1, 'only latest queued generation publishes');
    assert(read(`${obar.obarRunDir.get_path()}/assets/toggle-on.svg`).includes('#0000ff'), 'latest generation assets win');
} else {
    throw new Error(`Unknown test: ${test}`);
}
print(`PASS ${test}`);
