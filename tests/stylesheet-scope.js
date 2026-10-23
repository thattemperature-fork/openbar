// Compare generated stylesheets against a supplied pre-fix stylesheets.js.
// GSETTINGS_BACKEND=memory gjs -m tests/stylesheet-scope.js BASELINE TEMP_DIR
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import * as Utils from '../openbar@neuromorph/utils.js';

function read(path) {
    return new TextDecoder().decode(GLib.file_get_contents(path)[1]);
}
// Evaluate the unexported generator unchanged; inject its actual dependencies.
// No source copies/fixtures to drift, and no production test-only exports.
function generator(path) {
    const source = read(path).replace(/^import .*;$/gm, '').replace(/^export /gm, '');
    return new Function('Gio', 'GLib', 'Pango', 'Utils', `${source}\nreturn getStylesheet;`)(Gio, GLib, Pango, Utils);
}
const [baseline, temp] = ARGV;
if (!baseline || !temp)
    throw new Error('Usage: gjs -m tests/stylesheet-scope.js BASELINE TEMP_DIR');
const schemaSource = Gio.SettingsSchemaSource.new_from_directory(
    `${temp}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
const settings = new Gio.Settings({settings_schema: schemaSource.lookup('org.gnome.shell.extensions.openbar', false)});
const obar = {
    _settings: settings,
    _intSettings: {get_string: () => 'prefer-dark'},
    _hcSettings: {get_boolean: () => false},
    main: {sessionMode: {isLocked: false}},
    gnomeVersion: 49,
};
const old = generator(baseline);
const current = generator(`${GLib.get_current_dir()}/openbar@neuromorph/stylesheets.js`);
let checks = 0;
function assert(test, message) {
    if (!test)
        throw new Error(message);
    checks++;
}
function rules(css) {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(match => ({
        selectors: match[1].split(',').map(s => s.trim()),
        body: match[2],
    }));
}
for (const mode of ['scoped', 'global-menu', 'global-all', 'disabled']) {
    settings.set_boolean('menustyle', mode !== 'disabled');
    settings.set_boolean('apply-menu-shell', mode === 'global-menu');
    settings.set_boolean('apply-all-shell', mode === 'global-all');
    const before = old(obar, null);
    const after = current(obar, null);
    if (mode !== 'scoped') {
        assert(before === after, `${mode}: output must be byte-identical`);
        continue;
    }
    const a = rules(before), b = rules(after);
    assert(a.length === b.length, 'No rules added or removed');
    let added = 0;
    for (let i = 0; i < a.length; i++) {
        assert(a[i].body === b[i].body, `Rule ${i} declarations unchanged`);
        assert(a[i].selectors.every((s, j) => s === b[i].selectors[j]), `Rule ${i} retains original selectors/order`);
        const extra = b[i].selectors.slice(a[i].selectors.length);
        for (const s of extra) {
            assert(s.startsWith('.openmenu.popup-menu-content .popup-'), `Narrow descendant scope: ${s}`);
            assert(a[i].selectors.includes(s.replace('.openmenu.popup-menu-content ', '.openmenu')),
                `Every addition has an original equivalent: ${s}`);
            added++;
        }
    }
    assert(added > 0, 'Scoped mode must add dynamic descendant selectors');
    print(`PASS: ${added} scoped selectors; existing selectors, declarations and order preserved`);
}
print(`PASS: ${checks} stylesheet assertions; global-menu/global-all/disabled byte-identical`);
