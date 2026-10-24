// Actual auto-theme functions, real memory Gio.Settings and native wallpaper decoding.
// Run only through round2-autotheming-native.sh (private HOME, bus and compositor).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const dir = GLib.getenv('OPENBAR_WMAX_DIR');
const preserveKey = 'autotheme-preserve-wmax';
let assertions = 0;
function assert(value, message) {
    if (!value) throw Error(message);
    assertions++;
    print(`PASS ${message}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keys = ['bgcolor-wmax', 'dark-bgcolor-wmax', 'light-bgcolor-wmax'];
const snapshot = settings => keys.map(key => settings.get_strv(key));
export async function run() { await new Promise(() => {}); }
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        test().then(() => GLib.file_set_contents(`${dir}/result`, JSON.stringify({shell: Config.PACKAGE_VERSION, assertions})))
            .catch(e => logError(e, 'round2-autotheming failed'))
            .finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
async function test() {
    await Scripting.sleep(1000);
    const path = `${dir}/openbar@neuromorph`;
    const {default: Openbar} = await import(`file://${path}/extension.js`);
    const auto = await import(`file://${path}/autothemes.js`);
    const baseline = await import(`file://${path}/baseline-autothemes.js`);
    const metadata = {...JSON.parse(new TextDecoder().decode(GLib.file_get_contents(`${path}/metadata.json`)[1])), path, dir: Gio.File.new_for_path(path)};
    const obar = new Openbar(metadata);
    obar._settings = obar.getSettings();
    obar._intSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});
    const settings = obar._settings, system = obar._intSettings;
    assert(settings.settings_schema.has_key(preserveKey), 'schema exposes explicit preserve option');
    assert(settings.get_default_value(preserveKey).get_boolean() === false, 'preserve defaults false');
    const reset = () => {
        for (const key of settings.settings_schema.list_keys()) settings.reset(key);
        obar._paletteCounts = null;
        settings.set_string('autotheme-dark', 'Dark');
        settings.set_string('autotheme-light', 'Light');
        for (let i = 1; i <= 12; i++) {
            settings.set_int(`count${i}`, 13 - i);
            for (const mode of ['dark', 'light']) settings.set_strv(`${mode}-palette${i}`, [String(i * 18), String(240 - i * 12), String(30 + i * 15)]);
        }
    };
    const seed = () => {
        // All-zero black is valid, not an unset/sentinel value. Keep current
        // deliberately different from the active-mode backup to test no writes.
        settings.set_strv(keys[0], ['0', '0', '0']);
        settings.set_strv(keys[1], ['0.07', '0.13', '0.19']);
        settings.set_strv(keys[2], ['0', '0', '0']);
    };
    const allValues = () => Object.fromEntries(settings.settings_schema.list_keys().sort().map(key => [key, settings.get_value(key).print(true)]));
    // RED reproducer: this must fail on the historical unconditional publication.
    reset(); seed(); settings.set_boolean(preserveKey, true);
    system.set_string('color-scheme', 'default');
    const before = snapshot(settings);
    auto.autoApplyBGPalette(obar, 'light');
    assert(same(snapshot(settings), before), 'opt-in preserves current and both per-mode colors including custom black');

    // Compare every native setting with the pre-change generator, not a duplicate
    // implementation of the palette formula. Include active and inactive modes.
    for (const theme of ['Dark', 'Light', 'Color', 'Pastel']) for (const current of ['default', 'prefer-dark']) for (const mode of ['light', 'dark']) for (const hint of [0, 57]) {
        reset(); seed(); system.set_string('color-scheme', current); settings.set_int('headerbar-hint', hint);
        settings.set_string('autotheme-dark', theme); settings.set_string('autotheme-light', theme);
        baseline.autoApplyBGPalette(obar, mode);
        const historical = allValues();
        reset(); seed(); settings.set_int('headerbar-hint', hint);
        settings.set_string('autotheme-dark', theme); settings.set_string('autotheme-light', theme);
        auto.autoApplyBGPalette(obar, mode);
        assert(same(allValues(), historical), `default output unchanged ${theme}/${current}/${mode}/hint=${hint}`);
    }
    for (const current of ['default', 'prefer-dark']) for (const matchHeaderbar of [false, true]) {
        reset(); seed(); system.set_string('color-scheme', current);
        if (current === 'prefer-dark') {
            settings.set_strv('dark-bgcolor-wmax', ['0', '0', '0']);
            settings.set_strv('light-bgcolor-wmax', ['0.71', '0.83', '0.91']);
        }
        settings.set_boolean('wmax-hbarhint', matchHeaderbar);
        settings.set_int('headerbar-hint', 57);
        baseline.autoApplyBGPalette(obar, 'dark'); baseline.autoApplyBGPalette(obar, 'light');
        const generated = allValues();
        // Restore deliberately custom WMax values, then compare everything else
        // against historical generation with the option enabled.
        seed();
        if (current === 'prefer-dark') {
            settings.set_strv('dark-bgcolor-wmax', ['0', '0', '0']);
            settings.set_strv('light-bgcolor-wmax', ['0.71', '0.83', '0.91']);
        }
        settings.set_boolean(preserveKey, true);
        const custom = snapshot(settings);
        let wmaxWrites = 0;
        const handler = settings.connect('changed', (_settings, key) => { if (keys.includes(key)) wmaxWrites++; });
        for (let refresh = 0; refresh < 3; refresh++) for (const mode of ['light', 'dark']) {
            settings.set_strv(`${mode}-bgcolor`, ['0', '0', '0']);
            settings.set_strv(`${mode}-mbgcolor`, ['0', '0', '0']);
            auto.autoApplyBGPalette(obar, mode);
            assert(same(snapshot(settings), custom), `preserve ${current}/${mode}/headerbar=${matchHeaderbar}/refresh=${refresh}`);
            assert(!same(settings.get_strv(`${mode}-bgcolor`), ['0', '0', '0']), 'other bar palette still generated');
            assert(!same(settings.get_strv(`${mode}-mbgcolor`), ['0', '0', '0']), 'other menu palette still generated');
            assert(settings.get_boolean('autotheme-font') && !settings.get_boolean('pause-reload'), 'auto-theme remains active and reload unpaused');
        }
        settings.disconnect(handler);
        const retained = allValues();
        const excluded = new Set([preserveKey, ...keys]);
        assert(Object.keys(generated).every(key => excluded.has(key) || retained[key] === generated[key]), 'all non-WMax settings match historical auto-theme output');
        assert(wmaxWrites === 0, 'preserve publishes no WMax setting changes');
        assert(settings.get_boolean('wmax-hbarhint') === matchHeaderbar && settings.get_int('headerbar-hint') === 57, 'headerbar matching and hint policy unchanged');
        for (const mode of ['light', 'dark', 'light', 'dark']) {
            system.set_string('color-scheme', mode === 'dark' ? 'prefer-dark' : 'default');
            auto.onModeChange(obar);
            assert(same(settings.get_strv('bgcolor-wmax'), settings.get_strv(`${mode}-bgcolor-wmax`)), `mode switch restores ${mode} custom backup`);
            assert(same(settings.get_strv(keys[1]), custom[1]) && same(settings.get_strv(keys[2]), custom[2]), 'mode switch keeps both custom backups');
        }
    }
    // Native GVariant roundtrip mirrors prefs' schema-key-based import/reset:
    // no new importer allowlist/migration, no special-case black detection.
    reset(); seed(); settings.set_boolean(preserveKey, true);
    const exported = Object.fromEntries([preserveKey, ...keys].map(key => [key, settings.get_value(key).print(true)]));
    settings.set_boolean('import-export', true);
    for (const key of [preserveKey, ...keys]) settings.reset(key);
    assert(!settings.get_boolean(preserveKey), 'reset returns preserve policy to historical default');
    for (const [key, value] of Object.entries(exported)) settings.set_value(key, GLib.Variant.parse(null, value, null, null));
    const imported = snapshot(settings);
    auto.autoApplyBGPalette(obar, 'dark'); auto.onModeChange(obar);
    assert(same(snapshot(settings), imported), 'active import blocks generation and mode-copy writes');
    settings.set_boolean('import-export', false);
    auto.autoApplyBGPalette(obar, 'dark'); auto.autoApplyBGPalette(obar, 'light');
    assert(settings.get_boolean(preserveKey) && same(snapshot(settings), imported), 'imported policy and custom colors survive generation');
    settings.reset(preserveKey); auto.autoApplyBGPalette(obar, 'light');
    assert(!same(settings.get_strv('light-bgcolor-wmax'), imported[2]), 'reset policy restores automatic WMax generation');

    // Exercise the actual native decoder -> backgroundPalette -> auto-theme path
    // repeatedly, including changed file content at unchanged wallpaper URIs.
    reset(); seed(); settings.set_boolean(preserveKey, true); settings.set_boolean('autotheme-refresh', true);
    const wallpapers = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
    obar._bgSettings = wallpapers;
    const solid = (mode, color) => {
        const pix = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 17, 23);
        pix.fill(color); pix.savev(`${dir}/${mode}.png`, 'png', [], []);
        settings.set_string(`${mode}-bguri`, Gio.File.new_for_path(`${dir}/${mode}.png`).get_uri());
    };
    const custom = snapshot(settings);
    for (let refresh = 0; refresh < 3; refresh++) {
        solid('dark', refresh === 1 ? 0x3050c0ff : 0x903040ff);
        solid('light', refresh === 1 ? 0xd08030ff : 0x30a050ff);
        await obar.backgroundPalette();
        assert(same(snapshot(settings), custom), `native wallpaper refresh ${refresh} preserves all WMax colors`);
        assert(obar._paletteCounts.dark[0] > 0 && obar._paletteCounts.light[0] > 0, 'both native wallpaper palettes publish');
        assert(settings.get_boolean('autotheme-refresh') && settings.get_boolean('autotheme-font'), 'native refresh does not disable automatic theming');
        const mode = refresh % 2 ? 'dark' : 'light';
        system.set_string('color-scheme', mode === 'dark' ? 'prefer-dark' : 'default'); auto.onModeChange(obar);
        // Normal mode change intentionally publishes the selected custom backup.
        custom[0] = custom[mode === 'dark' ? 1 : 2];
        assert(same(snapshot(settings), custom), 'native wallpaper mode switch uses retained custom colors');
    }
    obar.cancelBackgroundPalette();
}
