// Real native actors and St.ThemeNode; no CSS matcher or production copies.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import {CheckBox} from 'resource:///org/gnome/shell/ui/checkBox.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import Openbar from '../openbar@neuromorph/extension.js';
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
        if (GLib.getenv('OPENBAR_WIDGET_TEST') === 'fitts-session') {
            root.hide();
            const path = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('openbar@neuromorph').get_path();
            const {ExtensionType, ExtensionState} = await import('resource:///org/gnome/shell/misc/extensionUtils.js');
            const wallpaper = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 32, 32);
            wallpaper.fill(0x5380b0ff); wallpaper.savev(`${dir}/wallpaper.png`, 'png', [], []);
            const background = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
            const uri = Gio.File.new_for_path(`${dir}/wallpaper.png`).get_uri();
            background.set_string('picture-uri', uri); background.set_string('picture-uri-dark', uri);
            await Scripting.sleep(300);
            const manager = Main.extensionManager;
            const metadata = JSON.parse(read(`${path}/metadata.json`));
            const extension = manager.createExtensionObject(metadata.uuid, Gio.File.new_for_path(path), ExtensionType.PER_USER);
            manager.enableExtension(metadata.uuid);
            await Scripting.sleep(200);
            await manager.loadExtension(extension);
            await Scripting.sleep(6000);
            equal(extension.state, ExtensionState.ACTIVE, 'extension manager activated extension');
            const supported = parseInt(Config.PACKAGE_VERSION) < 50;
            equal(!!Main.panel.leftFittsWidget, supported, 'manager initial Fitts policy');
            for (let cycle = 0; cycle < 2; cycle++) {
                // Mode transitions only: do not invoke ScreenShield or authentication.
                Main.sessionMode.pushMode('unlock-dialog');
                await Scripting.sleep(500);
                equal(extension.state, ExtensionState.INACTIVE, 'unlock-dialog mode deactivates user extension');
                assert(!Main.panel.leftFittsWidget, 'unlock-dialog mode removes Fitts');
                Main.sessionMode.popMode('unlock-dialog');
                await Scripting.sleep(6000);
                equal(extension.state, ExtensionState.ACTIVE, 'return to user mode activates extension');
                equal(!!Main.panel.leftFittsWidget, supported, 'Fitts restored or gated after user-mode return');
            }
            manager.disableExtension(metadata.uuid);
            await Scripting.sleep(500);
            equal(extension.state, ExtensionState.INACTIVE, 'manager final disable');
            assert(!Main.panel.leftFittsWidget, 'manager final corner cleanup');
        }
        if (GLib.getenv('OPENBAR_WIDGET_TEST') === 'fitts-lifecycle') {
            root.hide();
            const path = Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('openbar@neuromorph').get_path();
            const metadata = {...JSON.parse(read(`${path}/metadata.json`)), path, dir: Gio.File.new_for_path(path)};
            const wallpaper = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 32, 32);
            wallpaper.fill(0x5380b0ff); wallpaper.savev(`${dir}/wallpaper.png`, 'png', [], []);
            const background = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
            const uri = Gio.File.new_for_path(`${dir}/wallpaper.png`).get_uri();
            background.set_string('picture-uri', uri); background.set_string('picture-uri-dark', uri);
            await Scripting.sleep(300);
            const extension = new Openbar(metadata);
            for (let cycle = 0; cycle < 2; cycle++) {
                extension.enable();
                await Scripting.sleep(6000);
                const supported = parseInt(Config.PACKAGE_VERSION) < 50;
                equal(!!Main.panel.leftFittsWidget, supported, `cycle ${cycle} real delayed enable gate`);
                if (supported) {
                    const settings = extension._settings;
                    settings.set_boolean('fitts-widgets', false);
                    await Scripting.sleep(100);
                    assert(!Main.panel.leftFittsWidget, 'real setting disables Fitts');
                    settings.set_boolean('fitts-widgets', true);
                    await Scripting.sleep(100);
                    assert(Main.panel.leftFittsWidget, 'real setting reenables Fitts');
                }
                extension._settings.set_string('position', 'Bottom');
                await Scripting.sleep(200);
                equal(!!Main.panel.leftFittsWidget, supported, `cycle ${cycle} real position-change gate`);
                extension._settings.set_string('position', 'Top');
                await Scripting.sleep(200);
                extension.disable();
                assert(!Main.panel.leftFittsWidget && !Main.panel.rightFittsWidget, 'lifecycle disable removes corners');
                await Scripting.sleep(1000);
                assert(!Main.panel.leftFittsWidget, 'no corner resurrection after disable');
            }
        }
        if (GLib.getenv('OPENBAR_WIDGET_TEST') === 'fitts') {
            settings.set_boolean('fitts-widgets', true);
            const fitts = Object.create(Openbar.prototype);
            Object.assign(fitts, {
                _settings: settings, _shellSettings: new Gio.Settings({schema_id: 'org.gnome.shell'}),
                gnomeVersion: 50, disabling: false,
                panelBoxes: [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox],
                addedSignal: 'child-added', removedSignal: 'child-removed',
            });
            // Actual ConnectManager implementation; do not duplicate signal semantics.
            const extensionSource = read(Gio.File.new_for_uri(import.meta.url).get_parent().get_parent().get_child('openbar@neuromorph/extension.js').get_path());
            const {default: Meta} = await import('gi://Meta');
            const LayoutManager = await import('resource:///org/gnome/shell/ui/layout.js');
            const Manager = new Function('Gio', 'Meta', 'LayoutManager', extensionSource.slice(extensionSource.indexOf('class ConnectManager'), extensionSource.indexOf('// Openbar Extension main class')) + '\nreturn ConnectManager;')(Gio, Meta, LayoutManager);
            fitts._connections = new Manager();
            const oldPanelStyle = Main.panel.get_style();
            Main.panel.set_style('margin-top: 8px;');
            // ConnectObject owner is intentionally unparented, not a rendered widget.
            const target = new PanelMenu.Button(0, 'Fitts fixture');
            target.add_child(new St.Label({text: 'Edge'}));
            Main.panel.addToStatusArea('openbar-fitts-fixture', target, 0, 'left');
            await Scripting.sleep(100);
            const btn = target.get_parent();
            try {
                fitts._connections.connect(target, 'notify::visible', () => {});
                fitts._connections.connect(Main.panel._leftBox, fitts.addedSignal, () => {});
                const coreConnections = fitts._connections.connections.length;
                fitts.enableFittsWidgets();
                assert(!Main.panel.leftFittsWidget && !Main.panel.rightFittsWidget, 'GNOME 50 enable gate');
                fitts.createFittsWidget(btn.get_parent(), btn);
                assert(!btn.FittsWidget, 'GNOME 50 direct/visibility gate');
                fitts.createFittsCornerWidgets();
                assert(!Main.panel.leftFittsWidget && !Main.panel.rightFittsWidget, 'GNOME 50 delayed corner gate');
                fitts.disableFittsWidgets();
                equal(fitts._connections.connections.length, coreConnections, 'inactive Fitts disable preserves core signals');
                // Exercise supported-version behavior on real actors on both runtimes.
                fitts.gnomeVersion = 49;
                for (const direction of [Clutter.TextDirection.LTR, Clutter.TextDirection.RTL]) {
                    Main.panel.set_text_direction(direction);
                    for (const box of fitts.panelBoxes) box.set_text_direction(direction);
                    Main.panel.queue_relayout();
                    await Scripting.sleep(100);
                    fitts.enableFittsWidgets();
                    await Scripting.sleep(100);
                    const buttons = fitts.panelBoxes.flatMap(box => [...box]).filter(b => (b.child instanceof PanelMenu.Button || b.child instanceof PanelMenu.ButtonBox) && b.child.visible);
                    const physical = buttons.map(b => ({btn: b, x: b.get_transformed_position()[0], width: b.get_transformed_size()[0]})).sort((a,b) => a.x - b.x);
                    assert(Main.panel.leftCornerButton === physical[0].btn, `left corner targets physical leftmost button dir=${direction}: ${physical.map(p => `${p.btn.child.constructor.name}:${p.x}:${p.width}`)}`);
                    assert(Main.panel.rightCornerButton === physical.at(-1).btn, 'right corner targets physical rightmost button');
                    assert(Main.panel.leftFittsWidget.width <= physical[0].x - Main.layoutManager.panelBox.x + 3, 'left corner stays outside button area');
                    assert(Main.panel.rightFittsWidget.x >= physical.at(-1).x + physical.at(-1).width - 3, 'right corner stays outside button area');
                    const connections = fitts._connections.connections.length;
                    fitts.enableFittsWidgets();
                    equal(fitts._connections.connections.length, connections, 'repeat enable is idempotent');
                    target.hide(); await Scripting.sleep(100);
                    assert(!btn.FittsWidget, 'hidden button proximity removed');
                    target.show(); await Scripting.sleep(100);
                    assert(btn.FittsWidget, 'visible button proximity restored');
                    const late = new PanelMenu.Button(0, 'Late Fitts fixture');
                    late.add_child(new St.Label({text: 'Late'}));
                    Main.panel.addToStatusArea('openbar-fitts-late', late, 0, 'center');
                    await Scripting.sleep(600);
                    assert(late.get_parent().FittsWidget, 'late button gets proximity');
                    equal(fitts._connections.connections.length, coreConnections, 'late Fitts signals are owned separately');
                    for (let i = 0; i < 3; i++) {
                        late.hide(); late.show();
                    }
                    let destroys = 0;
                    const destroy = fitts.destroyFittsWidget;
                    fitts.destroyFittsWidget = function (button) { destroys++; return destroy.call(this, button); };
                    late.destroy();
                    fitts.destroyFittsWidget = destroy;
                    equal(destroys, 1, 'one destroy hook after repeated visibility changes');
                    await Scripting.sleep(600);
                    fitts.disableFittsWidgets();
                    equal(fitts._connections.connections.length, coreConnections, 'Fitts toggle preserves core subscriptions');
                    assert(!btn.FittsWidget && !Main.panel.leftFittsWidget && !Main.panel.rightFittsWidget, 'disable removes all proximity actors');
                    fitts.disabling = true;
                    fitts.createFittsCornerWidgets(); fitts.enableFittsWidgets();
                    assert(!Main.panel.leftFittsWidget, 'late callbacks blocked after disable');
                    fitts.disabling = false;
                }
                fitts._shellSettings.set_strv('enabled-extensions', ['dash-to-panel@jderose9.github.com']);
                fitts.enableFittsWidgets();
                assert(!Main.panel.leftFittsWidget, 'Dash-to-Panel gate covers position resets');
                fitts._shellSettings.set_strv('enabled-extensions', []);
                settings.set_boolean('fitts-widgets', false);
                fitts.enableFittsWidgets();
                assert(!Main.panel.leftFittsWidget, 'setting gate covers delayed startup');
            } finally {
                fitts.disableFittsWidgets();
                fitts._connections.disconnectAll();
                target.destroy();
                Main.panel.set_style(oldPanelStyle);
                Main.panel.set_text_direction(Clutter.TextDirection.LTR);
                for (const box of fitts.panelBoxes) box.set_text_direction(Clutter.TextDirection.LTR);
            }
        }
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
            // Native switches embedded in real popup rows must use the same
            // checked-contrast palette as standalone switches, in every scope.
            // autofg and contrasting accents prevent mfg == amfg hiding bugs.
            obar._hcSettings.set_boolean('high-contrast', false);
            settings.set_boolean('autofg-menu', true);
            for (const mode of ['scoped', 'menu-global', 'accent-global']) {
                settings.set_boolean('menustyle', mode !== 'accent-global');
                settings.set_boolean('apply-menu-shell', mode === 'menu-global');
                settings.set_boolean('apply-accent-shell', mode === 'accent-global');
                root.set_style_class_name(mode === 'scoped' ? 'openmenu popup-menu-content' : '');
                for (const accent of [['0.95', '0.9', '0.85'], ['0.05', '0.1', '0.15']]) {
                    settings.set_strv('mscolor', accent);
                    reload();
                    const standalone = new PopupMenu.Switch(true);
                    const row = new PopupMenu.PopupSwitchMenuItem('Native popup switch', true);
                    if (mode === 'scoped') row.add_style_class_name('openmenu');
                    root.add_child(standalone); root.add_child(row);
                    for (const state of ['checked', 'checked hover', 'checked active', 'checked focus']) {
                        standalone.set_style_pseudo_class(state);
                        row._switch.set_style_pseudo_class(state);
                        equal(fg(row._switch), fg(standalone), `popup switch contrast ${mode} ${accent[0]} ${state}`);
                        equal(bg(row._switch), bg(standalone), `popup switch background ${mode} ${state}`);
                    }
                    standalone.destroy(); row.destroy();
                }
            }
            settings.set_boolean('autofg-menu', false);
            settings.set_strv('mscolor', ['0.9', '0.1', '0.2']);
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
