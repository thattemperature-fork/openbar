// Isolate all modern-message CSS additions against baseline 1aa1eb3.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import * as Utils from '../openbar@neuromorph/utils.js';
const [baseline, temp] = ARGV;
function generator(path) {
    const source = new TextDecoder().decode(GLib.file_get_contents(path)[1])
        .replace(/^import .*;$/gm, '').replace(/^export /gm, '');
    return new Function('Gio', 'GLib', 'Pango', 'Utils', `${source}\nreturn getStylesheet;`)(Gio, GLib, Pango, Utils);
}
const schema = Gio.SettingsSchemaSource.new_from_directory(`${temp}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
const settings = new Gio.Settings({settings_schema: schema.lookup('org.gnome.shell.extensions.openbar', false)});
const obar = {_settings: settings, _intSettings: {get_string: () => 'prefer-dark'},
    _hcSettings: {get_boolean: () => false}, main: {sessionMode: {isLocked: false}}, gnomeVersion: 49};
const old = generator(baseline);
const current = generator(`${GLib.get_current_dir()}/openbar@neuromorph/stylesheets.js`);
function rules(css) {
    return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m => ({
        selectors: m[1].split(',').map(s => s.trim()), body: m[2].trim(),
    }));
}
let checks = 0;
function assert(value, label) {
    if (!value) throw new Error(label);
    checks++;
}
for (const mode of ['scoped', 'global-menu', 'global-all', 'disabled']) {
    settings.set_boolean('menustyle', mode !== 'disabled');
    settings.set_boolean('apply-menu-shell', mode === 'global-menu');
    settings.set_boolean('apply-all-shell', mode === 'global-all');
    const before = old(obar, null), after = current(obar, null);
    if (mode === 'disabled') {
        assert(before === after, 'disabled CSS byte-identical');
        continue;
    }
    const a = rules(before), b = rules(after);
    const prefix = mode === 'scoped' ? '.openmenu' : '';
    const known = new Set(a.flatMap(r => r.selectors));
    const filtered = [];
    let extra = 0;
    for (const rule of b) {
        const retained = [];
        for (const selector of rule.selectors) {
            if (known.has(selector)) {
                retained.push(selector);
                continue;
            }
            extra++;
            if (selector.startsWith('.openmenu.message-view .message')) {
                const original = selector.replace('.openmenu.message-view ', '.openmenu');
                if (known.has(original)) {
                    assert(a.some(r => r.selectors.includes(original) && r.body === rule.body), 'scoped equivalent declarations preserved');
                    continue;
                }
            }
            assert([
                `${prefix}.message-view .message-group-title`, `${prefix}.message-view .message-collapse-button`,
                `${prefix}.message-view .message-collapse-button:hover`, `${prefix}.message-view .message-collapse-button:focus`,
                `${prefix}.message.media-message .message-icon.message-themed-icon`,
                '.openmenu.message-view .message.media-message .message-icon.message-themed-icon',
            ].includes(selector), `only documented modern additions allowed: ${selector}`);
        }
        if (retained.length) filtered.push({selectors: retained, body: rule.body});
    }
    assert(extra > 0, `${mode}: modern selectors generated`);
    assert(JSON.stringify(filtered) === JSON.stringify(a), `${mode}: all original rules/declarations/order preserved`);
}
print(`PASS: menu-modern stylesheet: ${checks} assertions`);
