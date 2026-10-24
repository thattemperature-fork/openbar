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
} else if (test === 'gtk-original-bytes') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-gtk', true);
    const dir = `${GLib.get_user_config_dir()}/gtk-3.0`;
    GLib.mkdir_with_parents(dir, 0o700);
    const original = new Uint8Array([47, 42, 32, 255, 254, 32, 42, 47, 10]);
    GLib.file_set_contents(`${dir}/gtk.css`, original);
    await Styles.saveGtkCss(obar, 'enable');
    await Styles.saveGtkCss(obar, 'disable');
    const restored = GLib.file_get_contents(`${dir}/gtk.css`)[1];
    assert(original.length === restored.length && original.every((byte, index) => byte === restored[index]), 'original CSS backup must restore exact bytes, not lossy UTF8 decoding');
} else if (test === 'gtk-restore') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-gtk', true);
    for (const version of [3, 4]) {
        const dir = `${GLib.get_user_config_dir()}/gtk-${version}.0`;
        GLib.mkdir_with_parents(dir, 0o700);
        GLib.file_set_contents(`${dir}/gtk.css`, `original ${version}`);
    }
    await Styles.saveGtkCss(obar, 'enable');
    await Styles.saveGtkCss(obar, 'enable');
    Styles.invalidateStyleWrites(obar);
    obar._settings = null;
    await Styles.saveGtkCss(obar, 'disable');
    for (const version of [3, 4]) {
        const dir = `${GLib.get_user_config_dir()}/gtk-${version}.0`;
        assert(read(`${dir}/gtk.css`) === `original ${version}`, 'restore must preserve exact original');
        assert(!GLib.file_test(`${dir}/gtk_backup_byOpenBar.css`, GLib.FileTest.EXISTS), 'restore consumes only owned backup');
    }
} else if (test === 'gtk-edits') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-gtk', true);
    const dir = `${GLib.get_user_config_dir()}/gtk-3.0`;
    GLib.mkdir_with_parents(dir, 0o700);
    GLib.file_set_contents(`${dir}/gtk.css`, 'original user stylesheet');
    await Styles.saveGtkCss(obar, 'enable');
    const edited = `${read(`${dir}/gtk.css`)}\n/* independent user edit */`;
    GLib.file_set_contents(`${dir}/gtk.css`, edited);
    try { await Styles.saveGtkCss(obar, 'enable'); } catch (_) { /* refusal expected */ }
    assert(read(`${dir}/gtk.css`) === edited, 'regeneration must not erase user edits including Open Bar header');
    try { await Styles.saveGtkCss(obar, 'disable'); } catch (_) { /* refusal expected */ }
    assert(read(`${dir}/gtk.css`) === edited, 'disable must not erase edited generated CSS');
    assert(!GLib.file_test(`${GLib.get_user_config_dir()}/gtk-4.0/gtk.css`, GLib.FileTest.EXISTS), 'conflict in GTK3 must not prevent GTK4 cleanup');
    assert(read(`${dir}/gtk_backup_byOpenBar.css`) === 'original user stylesheet', 'edited generated file does not destroy original backup');
} else if (test === 'gtk-symlink') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-gtk', true);
    const dir = `${GLib.get_user_config_dir()}/gtk-3.0`;
    GLib.mkdir_with_parents(dir, 0o700);
    const target = `${root}/external.css`;
    GLib.file_set_contents(target, 'symlink target');
    Gio.File.new_for_path(`${dir}/gtk.css`).make_symbolic_link(target, null);
    let failed = false;
    try { await Styles.saveGtkCss(obar, 'enable'); } catch (_) { failed = true; }
    assert(failed, 'GTK symlink must be refused');
    assert(GLib.file_test(`${dir}/gtk.css`, GLib.FileTest.IS_SYMLINK), 'GTK symlink must remain a symlink');
    assert(read(target) === 'symlink target', 'never modify GTK symlink target');
} else if (test === 'gtk-backup-edit') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-gtk', true);
    const dir = `${GLib.get_user_config_dir()}/gtk-3.0`;
    GLib.mkdir_with_parents(dir, 0o700);
    GLib.file_set_contents(`${dir}/gtk.css`, 'original');
    await Styles.saveGtkCss(obar, 'enable');
    const generated = read(`${dir}/gtk.css`);
    GLib.file_set_contents(`${dir}/gtk_backup_byOpenBar.css`, 'independent backup edit');
    let failed = false;
    try { await Styles.saveGtkCss(obar, 'disable'); } catch (_) { failed = true; }
    assert(failed, 'changed backup must not be restored');
    assert(read(`${dir}/gtk.css`) === generated, 'changed backup must leave generated file intact');
    assert(read(`${dir}/gtk_backup_byOpenBar.css`) === 'independent backup edit', 'changed backup must survive');
} else if (test === 'gtk-backup-failure') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-gtk', true);
    const dir = `${GLib.get_user_config_dir()}/gtk-3.0`;
    GLib.mkdir_with_parents(`${dir}/gtk_backup_byOpenBar.css`, 0o700);
    GLib.file_set_contents(`${dir}/gtk_backup_byOpenBar.css/keep`, 'backup obstruction');
    GLib.file_set_contents(`${dir}/gtk.css`, 'original user css');
    let failed = false;
    try { await Styles.saveGtkCss(obar, 'enable'); } catch (_) { failed = true; }
    assert(failed, 'backup failure must reject before overwrite');
    assert(read(`${dir}/gtk.css`) === 'original user css', 'backup failure must preserve original');
    assert(read(`${dir}/gtk_backup_byOpenBar.css/keep`) === 'backup obstruction', 'existing backup must remain untouched');
} else if (test === 'flatpak-missing-key') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-flatpak', true);
    const dir = `${GLib.get_user_data_dir()}/flatpak/overrides`;
    GLib.mkdir_with_parents(dir, 0o700);
    const path = `${dir}/global`;
    GLib.file_set_contents(path, '# independent comment\n[Context]\nsockets=wayland;\n[Environment]\nCUSTOM=kept\n');
    await Styles.saveFlatpakOverrides(obar, 'enable');
    const enabled = GLib.KeyFile.new();
    enabled.load_from_file(path, GLib.KeyFileFlags.NONE);
    assert(enabled.get_string_list('Context', 'filesystems').length === 2, 'missing filesystems must be supported');
    await Styles.saveFlatpakOverrides(obar, 'disable');
    const disabled = GLib.KeyFile.new();
    disabled.load_from_file(path, GLib.KeyFileFlags.NONE);
    assert(!disabled.get_keys('Context')[0].includes('filesystems'), 'original missing key must remain missing');
    assert(disabled.get_string('Environment', 'CUSTOM') === 'kept', 'unrelated group must survive');
    assert(read(path).includes('# independent comment'), 'comments must survive');
} else if (test === 'flatpak-user-changes') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-flatpak', true);
    const dir = `${GLib.get_user_data_dir()}/flatpak/overrides`;
    GLib.mkdir_with_parents(dir, 0o700);
    const path = `${dir}/global`;
    GLib.file_set_contents(path, '[Context]\nfilesystems=home;xdg-config/gtk-3.0:ro;\n');
    await Styles.saveFlatpakOverrides(obar, 'enable');
    const key = GLib.KeyFile.new();
    key.load_from_file(path, GLib.KeyFileFlags.NONE);
    key.set_string_list('Context', 'filesystems', [...key.get_string_list('Context', 'filesystems'), 'xdg-download:ro']);
    key.set_string('Environment', 'USER_EDIT', 'preserved');
    key.save_to_file(path);
    Styles.invalidateStyleWrites(obar);
    obar._settings = null;
    await Styles.saveFlatpakOverrides(obar, 'disable');
    key.load_from_file(path, GLib.KeyFileFlags.NONE);
    assert(key.get_string_list('Context', 'filesystems').join(';') === 'home;xdg-config/gtk-3.0:ro;xdg-download:ro', 'preserve preexisting permission and user additions');
    assert(key.get_string('Environment', 'USER_EDIT') === 'preserved', 'preserve unrelated updated key');
} else if (test === 'flatpak-user-removal') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-flatpak', true);
    await Styles.saveFlatpakOverrides(obar, 'enable');
    const path = `${GLib.get_user_data_dir()}/flatpak/overrides/global`;
    GLib.file_set_contents(path, '[Context]\nfilesystems=!xdg-config/gtk-3.0;xdg-config/gtk-4.0:rw;\n');
    await Styles.saveFlatpakOverrides(obar, 'enable');
    assert(read(path) === '[Context]\nfilesystems=!xdg-config/gtk-3.0;xdg-config/gtk-4.0:rw;\n', 're-enable must not re-add externally removed permissions');
    await Styles.saveFlatpakOverrides(obar, 'disable');
    const key = GLib.KeyFile.new();
    key.load_from_file(path, GLib.KeyFileFlags.NONE);
    assert(key.get_string_list('Context', 'filesystems').join(';') === '!xdg-config/gtk-3.0;xdg-config/gtk-4.0:rw', 'user denial/changed access must not be resurrected or removed');
} else if (test === 'flatpak-no-file') {
    const obar = fixture(test);
    const path = `${GLib.get_user_data_dir()}/flatpak/overrides/global`;
    await Styles.saveFlatpakOverrides(obar, 'disable');
    assert(!GLib.file_test(path, GLib.FileTest.EXISTS), 'disable without ownership must not create overrides');
    obar._settings.set_boolean('apply-flatpak', true);
    await Styles.saveFlatpakOverrides(obar, 'enable');
    await Styles.saveFlatpakOverrides(obar, 'enable');
    await Styles.saveFlatpakOverrides(obar, 'disable');
    const key = GLib.KeyFile.new();
    key.load_from_file(path, GLib.KeyFileFlags.NONE);
    assert(!key.has_group('Context') || !key.get_keys('Context')[0].includes('filesystems'), 'original-less cleanup must leave no added permission');
} else if (test === 'flatpak-symlink') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-flatpak', true);
    const dir = `${GLib.get_user_data_dir()}/flatpak/overrides`;
    GLib.mkdir_with_parents(dir, 0o700);
    const target = `${root}/flatpak-target`;
    GLib.file_set_contents(target, '[Context]\nfilesystems=home;\n');
    Gio.File.new_for_path(`${dir}/global`).make_symbolic_link(target, null);
    let failed = false;
    try { await Styles.saveFlatpakOverrides(obar, 'enable'); } catch (_) { failed = true; }
    assert(failed, 'refuse symlink override');
    assert(read(target) === '[Context]\nfilesystems=home;\n', 'preserve symlink target');
    assert(GLib.file_test(`${dir}/global`, GLib.FileTest.IS_SYMLINK), 'preserve symlink itself');
} else if (test === 'flatpak-write-failure') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-flatpak', true);
    const dir = `${GLib.get_user_data_dir()}/flatpak/overrides`;
    GLib.mkdir_with_parents(`${dir}/global`, 0o700);
    GLib.file_set_contents(`${dir}/global/keep`, 'independent file');
    let failed = false;
    try { await Styles.saveFlatpakOverrides(obar, 'enable'); } catch (_) { failed = true; }
    assert(failed, 'Flatpak write failure must reject');
    await Styles.saveFlatpakOverrides(obar, 'disable');
    assert(read(`${dir}/global/keep`) === 'independent file', 'failed apply must claim no ownership');
} else if (test === 'flatpak-disable-active') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-flatpak', true);
    let started;
    const ready = new Promise(resolve => { started = resolve; });
    const original = Gio.File.prototype.replace_contents_bytes_async;
    Gio.File.prototype.replace_contents_bytes_async = function (...args) {
        if (this.get_basename() === 'global') started();
        return original.apply(this, args);
    };
    const pending = Styles.saveFlatpakOverrides(obar, 'enable');
    await ready;
    Styles.invalidateStyleWrites(obar);
    obar._settings = null;
    const cleanup = Styles.saveFlatpakOverrides(obar, 'disable');
    await pending;
    await cleanup;
    const key = GLib.KeyFile.new();
    key.load_from_file(`${GLib.get_user_data_dir()}/flatpak/overrides/global`, GLib.KeyFileFlags.NONE);
    assert(!key.get_keys('Context')[0].includes('filesystems'), 'active transaction must finish before disable removes its permissions');
} else if (test === 'flatpak-repeat') {
    const obar = fixture(test);
    obar._settings.set_boolean('apply-flatpak', true);
    const dir = `${GLib.get_user_data_dir()}/flatpak/overrides`;
    GLib.mkdir_with_parents(dir, 0o700);
    const path = `${dir}/global`;
    GLib.file_set_contents(path, '[Context]\nfilesystems=home;\n');
    await Styles.saveFlatpakOverrides(obar, 'enable');
    await Styles.saveFlatpakOverrides(obar, 'enable');
    const enabled = GLib.KeyFile.new();
    enabled.load_from_file(path, GLib.KeyFileFlags.NONE);
    const entries = enabled.get_string_list('Context', 'filesystems');
    assert(entries.filter(entry => entry === 'xdg-config/gtk-3.0:ro').length === 1, 'repeated enable must not duplicate added permissions');
    await Styles.saveFlatpakOverrides(obar, 'disable');
    const disabled = GLib.KeyFile.new();
    disabled.load_from_file(path, GLib.KeyFileFlags.NONE);
    assert(disabled.get_string_list('Context', 'filesystems').join(';') === 'home', 'enable/enable/disable must remove only owned additions');
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
