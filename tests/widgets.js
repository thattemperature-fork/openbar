// Real native actors and St.ThemeNode; no CSS matcher or production copies.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {CheckBox} from 'resource:///org/gnome/shell/ui/checkBox.js';
import * as Utils from '../openbar@neuromorph/utils.js';

let checks = 0;
function assert(ok, message) {
    if (!ok) throw new Error(message);
    checks++;
}
function equal(actual, expected, message) {
    assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
}
function read(path) { return new TextDecoder().decode(GLib.file_get_contents(path)[1]); }
const dir = GLib.getenv('OPENBAR_TEST_DIR');
const generator = new Function('Gio', 'GLib', 'Pango', 'Utils',
    read(Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('openbar@neuromorph/stylesheets.js').get_path())
        .replace(/^import .*;$/gm, '').replace(/^export /gm, '') + '\nreturn getStylesheet;')(Gio, GLib, Pango, Utils);
const states = ['', 'hover', 'focus', 'active', 'checked', 'checked:hover', 'checked:focus', 'checked:active'];
function radii(actor) {
    return [0, 1, 2, 3].map(corner => actor.get_theme_node().get_border_radius(corner));
}
function bg(actor) { return actor.get_theme_node().get_background_color().to_string(); }
function fg(actor) { return actor.get_theme_node().get_foreground_color().to_string(); }
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        tests().catch(e => logError(e, 'widgets regression failed')).finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
export async function run() { await new Promise(() => {}); }
async function tests() {
    await Scripting.sleep(500);
    const schema = Gio.SettingsSchemaSource.new_from_directory(`${dir}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
    const settings = new Gio.Settings({settings_schema: schema.lookup('org.gnome.shell.extensions.openbar', false)});
    const obar = {
        _settings: settings,
        _intSettings: new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}),
        _hcSettings: new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.interface'}),
        main: Main, gnomeVersion: parseInt(Config.PACKAGE_VERSION),
    };
    settings.set_boolean('menustyle', true);
    settings.set_boolean('autofg-menu', false);
    settings.set_boolean('autohg-menu', false);
    settings.set_boolean('smbgoverride', true);
    settings.set_strv('mfgcolor', ['0.8', '0.2', '0.3']);
    settings.set_strv('mbgcolor', ['0.1', '0.2', '0.3']);
    settings.set_strv('smbgcolor', ['0.3', '0.2', '0.1']);
    settings.set_strv('mscolor', ['0.9', '0.1', '0.2']);
    settings.set_double('msalpha', 0.65);
    settings.set_double('mbgalpha', 0.7);
    let theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    let file = null;
    let loaded = false;
    let generation = 0;
    function reload() {
        if (loaded) theme.unload_stylesheet(file);
        theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
        if (loaded) theme.unload_stylesheet(file);
        file = Gio.File.new_for_path(`${dir}/stylesheet-${++generation}.css`);
        GLib.file_set_contents(file.get_path(), generator(obar, null));
        theme.load_stylesheet(file);
        loaded = true;
    }
    const root = new St.BoxLayout({vertical: true, width: 700, height: 500});
    Main.uiGroup.add_child(root);
    try {
        if (GLib.getenv('OPENBAR_WIDGET_TEST') === 'gradient') {
            // Exercise real theme-node pseudo-class transitions with all bar layouts.
            root.hide();
            settings.set_string('gradient-direction', 'horizontal');
            settings.set_boolean('wmax-hbarhint', false);
            settings.set_strv('bgcolor-wmax', ['0.2', '0.3', '0.4']);
            settings.set_double('bgalpha-wmax', 0.8);
            const panel = new St.BoxLayout({name: 'panel', style_class: 'openbar', width: 700});
            const container = new St.Bin({style_class: 'button-container'});
            const button = new St.Button({style_class: 'panel-button', label: 'Window max'});
            container.set_child(button); panel.add_child(container); Main.uiGroup.add_child(panel);
            try {
                for (const bartype of ['Islands', 'Trilands', 'Mainland', 'Floating']) {
                    settings.set_string('bartype', bartype);
                    panel.set_style_class_name(bartype === 'Trilands' ? 'openbar trilands' : 'openbar');
                    for (const gradient of [false, true]) {
                        settings.set_boolean('gradient', gradient);
                        for (const keepButtons of [false, true]) {
                            settings.set_boolean('buttonbg-wmax', keepButtons);
                            reload();
                            panel.set_style_pseudo_class('');
                            const normal = [panel.get_theme_node().get_background_gradient()[0], button.get_theme_node().get_background_gradient()[0]];
                            const island = bartype === 'Islands' || bartype === 'Trilands';
                            equal(normal, [gradient && !island ? St.GradientType.HORIZONTAL : St.GradientType.NONE,
                                gradient && island ? St.GradientType.HORIZONTAL : St.GradientType.NONE], `normal gradient ${bartype}`);
                            panel.set_style_pseudo_class('windowmax');
                            equal(panel.get_theme_node().get_background_gradient()[0], St.GradientType.NONE, `max panel clears gradient ${bartype}`);
                            equal(bg(panel), '#334c66cc', `max panel uses solid selected color ${bartype}`);
                            if (!keepButtons) equal(bg(button), '#00000000', `max button transparent ${bartype}`);
                            equal(button.get_theme_node().get_background_gradient()[0], gradient && island && keepButtons ? St.GradientType.HORIZONTAL : St.GradientType.NONE,
                                `max button gradient ${bartype} gradient=${gradient} keep=${keepButtons}`);
                            for (const state of ['', 'hover', 'focus', 'active', 'checked']) {
                                button.set_style_pseudo_class(state);
                                if (!keepButtons) equal(button.get_theme_node().get_background_gradient()[0], St.GradientType.NONE, `max reset persists ${state}`);
                            }
                            button.set_style_pseudo_class('');
                            panel.set_style_pseudo_class('');
                            equal([panel.get_theme_node().get_background_gradient()[0], button.get_theme_node().get_background_gradient()[0]], normal, 'unmaximize restores gradient');
                        }
                    }
                }
            } finally { panel.destroy(); }
        }
        if (GLib.getenv('OPENBAR_WIDGET_TEST') === 'switches') {
            for (const mode of ['scoped', 'menu-global', 'accent-global']) {
                settings.set_boolean('menustyle', mode !== 'accent-global');
                settings.set_boolean('apply-menu-shell', mode === 'menu-global');
                settings.set_boolean('apply-accent-shell', mode === 'accent-global');
                root.set_style_class_name(mode === 'scoped' ? 'openmenu' : '');
                for (const hc of [false, true]) {
                    obar._hcSettings.set_boolean('high-contrast', hc);
                    await Scripting.sleep(200);
                    reload();
                    for (const direction of [Clutter.TextDirection.LTR, Clutter.TextDirection.RTL]) {
                        root.set_text_direction(direction);
                        const sw = new PopupMenu.Switch(false);
                        const cb = new CheckBox('Native checkbox');
                        root.add_child(sw); root.add_child(cb);
                        for (const a of [sw, cb]) a.set_text_direction(direction);
                        for (const state of states) {
                            sw.set_style_pseudo_class(state.replaceAll(':', ' ')); cb.set_style_pseudo_class(state.replaceAll(':', ' '));
                            equal(sw.get_theme_node().get_background_image(), null, `native switch has no legacy image ${mode} ${state}`);
                            equal(cb._box.get_theme_node().get_background_image(), null, `native checkbox has no legacy image ${mode} ${state}`);
                            assert(bg(sw._handle) !== '#00000000', 'native handle retained');
                            if (state.includes('checked')) {
                                // Both controls use the same custom accent/state color and alpha.
                                equal(bg(sw), bg(cb._check), `switch/checkbox palette ${state}`);
                                assert(bg(sw).startsWith('#e51933') || state.includes('hover') || state.includes('active'), `checked custom accent ${bg(sw)}`);
                                assert(fg(cb._check) !== '#00000000', 'checked mark visible');
                            } else {
                                equal(fg(cb._check), '#00000000', 'unchecked mark hidden');
                                equal(bg(cb._check), '#00000000', 'unchecked background transparent');
                            }
                            if (state.includes('focus')) {
                                const shadow = cb._box.get_theme_node().get_box_shadow();
                                assert(shadow && shadow.color.to_string().startsWith('#e51933'), 'focus ring uses custom accent');
                            }
                            const before = [bg(sw), bg(cb._check), fg(cb._check)];
                            obar._intSettings.set_string('accent-color', 'green');
                            await Scripting.sleep(10);
                            equal([bg(sw), bg(cb._check), fg(cb._check)], before, 'modern controls independent of native accent');
                            obar._intSettings.set_string('accent-color', 'blue');
                        }
                        sw.destroy(); cb.destroy();
                    }
                }
            }
            // Exercise legacy CSS in the real St parser using native legacy-shaped actors.
            // Does not claim a GNOME 45/46 compositor test.
            obar.gnomeVersion = 45;
            settings.set_boolean('menustyle', true);
            settings.set_boolean('apply-menu-shell', false);
            settings.set_boolean('apply-accent-shell', false);
            root.set_style_class_name('openmenu');
            for (const hc of [false, true]) {
                obar._hcSettings.set_boolean('high-contrast', hc);
                await Scripting.sleep(200);
                reload();
                const legacy = new St.Widget({style_class: 'toggle-switch'});
                const legacyCheck = new St.Button({style_class: 'check-box'});
                const bin = new St.Bin();
                legacyCheck.set_child(bin);
                root.add_child(legacy); root.add_child(legacyCheck);
                equal(legacy.get_theme_node().get_background_image()?.get_basename(), hc ? 'toggle-off-hc.svg' : 'toggle-off.svg', 'legacy switch SVG fallback');
                for (const [state, image] of [['', 'checkbox-off.svg'], ['checked', 'checkbox-on.svg'], ['focus', 'checkbox-off-focused.svg'], ['checked focus', 'checkbox-on-focused.svg']]) {
                    legacyCheck.set_style_pseudo_class(state);
                    equal(bin.get_theme_node().get_background_image()?.get_basename(), image, `legacy checkbox ${state}`);
                }
                legacy.add_style_pseudo_class('checked');
                equal(legacy.get_theme_node().get_background_image()?.get_basename(), hc ? 'toggle-on-hc.svg' : 'toggle-on.svg', 'legacy checked switch SVG fallback');
                legacy.destroy(); legacyCheck.destroy();
            }
        }
        if (GLib.getenv('OPENBAR_WIDGET_TEST') === 'quick') {
            for (const globalStyle of [false, true]) {
                settings.set_boolean('apply-menu-shell', globalStyle);
                for (const hc of [false, true]) {
                    obar._hcSettings.set_boolean('high-contrast', hc);
                    await Scripting.sleep(200);
                    for (const radius of [0, 11]) {
                        settings.set_double('qtoggle-radius', radius);
                        reload();
                        for (const direction of [Clutter.TextDirection.LTR, Clutter.TextDirection.RTL]) {
                            root.set_text_direction(direction);
                            const split = new QuickSettings.QuickMenuToggle({title: 'Split', toggleMode: true});
                            const single = new QuickSettings.QuickToggle({title: 'Single', toggleMode: true});
                            root.add_child(split);
                            root.add_child(single);
                            split.add_style_class_name('openmenu');
                            single.add_style_class_name('openmenu');
                            const toggle = split._box.get_first_child();
                            const separator = split._box.get_children()[1];
                            const arrow = split._menuButton;
                            // Explicit direction on descendants makes each case independent of the desktop locale.
                            for (const a of [split, split._box, toggle, separator, arrow, single]) a.set_text_direction(direction);
                            for (const state of states) {
                                split.set_style_pseudo_class(state.replaceAll(':', ' '));
                                toggle.set_style_pseudo_class(state.replaceAll(':', ' '));
                                arrow.set_style_pseudo_class(state.replaceAll(':', ' '));
                                single.set_style_pseudo_class(state.replaceAll(':', ' '));
                                const ltr = direction === Clutter.TextDirection.LTR;
                                equal(radii(arrow), ltr ? [0, radius, radius, 0] : [radius, 0, 0, radius], `menu radius ${state} hc=${hc}`);
                                equal(radii(toggle), ltr ? [radius, 0, 0, radius] : [0, radius, radius, 0], `toggle radius ${state}`);
                                equal(radii(single), [radius, radius, radius, radius], `standalone radius ${state}`);
                                equal(bg(arrow), bg(toggle), `split alpha/palette ${state}`);
                                // Switch native accent while custom palette remains fixed; neither arrow nor separator may change.
                                const before = [bg(separator), bg(arrow)];
                                const expectedSeparator = new St.Widget({style: 'background-color: rgba(204,51,76,0.25);'});
                                root.add_child(expectedSeparator);
                                equal(bg(separator), bg(expectedSeparator), `separator custom foreground/alpha ${state}`);
                                expectedSeparator.destroy();
                                const accent = obar._intSettings.get_string('accent-color');
                                obar._intSettings.set_string('accent-color', accent === 'blue' ? 'purple' : 'blue');
                                await Scripting.sleep(10);
                                equal([bg(separator), bg(arrow)], before, `no native accent leak ${state}`);
                            }
                            // Standalone QuickToggle above covers unsplit controls. Shell's
                            // menuEnabled=false keeps hidden siblings in :last-child counting.
                            split.destroy(); single.destroy();
                        }
                    }
                }
            }
        }
    } finally {
        if (loaded) theme.unload_stylesheet(file);
        root.destroy();
    }
    const result = `PASS: GNOME ${Config.PACKAGE_VERSION} ${GLib.getenv('OPENBAR_WIDGET_TEST')}: ${checks} assertions`;
    print(result);
    GLib.file_set_contents(`${dir}/result`, result + '\n');
}
