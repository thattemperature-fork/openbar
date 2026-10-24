import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export const root = GLib.getenv('OPENBAR_GTK_DIR');
export const repo = GLib.getenv('OPENBAR_GTK_REPO');
export const sleep = ms => new Promise(resolve => GLib.timeout_add(0, ms, () => {
    resolve();
    return GLib.SOURCE_REMOVE;
}));
export const read = path => new TextDecoder().decode(GLib.file_get_contents(path)[1]);
export const write = (name, value) => GLib.file_set_contents(`${root}/${name}`, value);
export const failures = [];
export function check(condition, message) {
    print(`${condition ? 'PASS' : 'FAIL'} ${message}`);
    if (!condition) failures.push(message);
}
export async function generator() {
    const {saveGtkCss} = await import(`file://${repo}/openbar@neuromorph/stylesheets.js`);
    const source = Gio.SettingsSchemaSource.new_from_directory(`${root}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
    const settings = new Gio.Settings({settings_schema: source.lookup('org.gnome.shell.extensions.openbar', true)});
    const interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    const owner = {_settings: settings, _intSettings: interfaceSettings, popoverContentStyle: ''};
    return {
        settings, interfaceSettings,
        async generate(fixture = null) {
            if (fixture) {
                const file = new GLib.KeyFile();
                file.load_from_file(`${repo}/tests/fixtures/${fixture}`, GLib.KeyFileFlags.NONE);
                for (const key of file.get_keys('/')[0]) {
                    if (!settings.settings_schema.has_key(key)) continue;
                    const type = new GLib.VariantType(settings.get_value(key).get_type_string());
                    settings.set_value(key, GLib.Variant.parse(type, file.get_value('/', key), null, null));
                }
            }
            settings.set_boolean('apply-gtk', true);
            settings.set_boolean('import-export', false);
            settings.set_boolean('pause-reload', false);
            await saveGtkCss(owner, 'enable');
            if (!Gio.File.new_for_path(`${GLib.get_user_config_dir()}/gtk-4.0/gtk.css`).query_exists(null))
                throw Error('GTK writer did not create CSS');
        },
    };
}
export function finish(name, test) {
    const loop = new GLib.MainLoop(null, false);
    test().then(() => {
        if (failures.length) throw Error(`${failures.length} failed assertions: ${failures.join('; ')}`);
        write(`${name}.ok`, `PASS ${name}\n`);
        print(`PASS ${name} COMPLETE`);
    }).catch(error => {
        logError(error);
        write(`${name}.error`, String(error));
    }).finally(() => loop.quit());
    loop.run();
}
export function contrast(foreground, background) {
    const luminance = color => [color.red, color.green, color.blue]
        .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(foreground), b = luminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
