// Run in a disposable GNOME Shell with --automation-script (see run-menu-tests.sh).
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import {Slider} from 'resource:///org/gnome/shell/ui/slider.js';
import Openbar from '../openbar@neuromorph/extension.js';
import {reloadStyle} from '../openbar@neuromorph/stylesheets.js';

let checks = 0;
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
    checks++;
}
function colors(actor) {
    const node = actor.get_theme_node();
    return [node.get_foreground_color().to_string(), node.get_background_color().to_string(),
        node.get_background_image()?.get_basename() ?? null];
}
const states = ['', 'hover', 'focus', 'selected', 'active', 'active:hover',
    'active:focus', 'checked', 'checked:active', 'checked:hover', 'checked:focus',
    'checked:selected', 'checked:active:hover', 'selected:active:hover'];
function snapshot(actors) {
    const result = {};
    for (const [name, actor] of Object.entries(actors)) {
        const original = actor.get_style_pseudo_class();
        result[name] = states.map(state => {
            actor.set_style_pseudo_class(state);
            return colors(actor);
        });
        actor.set_style_pseudo_class(original);
    }
    return result;
}
function compare(actual, expected, label) {
    for (const name of Object.keys(expected)) {
        for (let i = 0; i < states.length; i++) {
            assert(JSON.stringify(actual[name][i]) === JSON.stringify(expected[name][i]),
                `${label} ${name}:${states[i] || 'normal'}: ${actual[name][i]} != ${expected[name][i]}`);
        }
    }
}
function populate(menu) {
    const actors = {};
    function row(parent, name) {
        const item = new PopupMenu.PopupMenuItem(name);
        parent.addMenuItem(item);
        actors[name] = item;
        return item;
    }
    row(menu, 'root');
    const submenu = new PopupMenu.PopupSubMenuMenuItem('submenu');
    menu.addMenuItem(submenu);
    actors.submenu = submenu;
    actors.submenuBox = submenu.menu.actor;
    row(submenu.menu, 'subrow');
    const section = new PopupMenu.PopupMenuSection();
    menu.addMenuItem(section);
    row(section, 'sectionRow');
    const nested = new PopupMenu.PopupSubMenuMenuItem('sectionSubmenu');
    section.addMenuItem(nested);
    actors.sectionSubmenu = nested;
    actors.sectionSubmenuBox = nested.menu.actor;
    row(nested.menu, 'sectionSubrow');
    const deepSection = new PopupMenu.PopupMenuSection();
    nested.menu.addMenuItem(deepSection);
    row(deepSection, 'deepRow');
    const separator = new PopupMenu.PopupSeparatorMenuItem();
    menu.addMenuItem(separator);
    actors.separator = separator.get_children().find(a => a.has_style_class_name('popup-separator-menu-item-separator'));
    const toggle = new PopupMenu.PopupSwitchMenuItem('toggle', true);
    menu.addMenuItem(toggle);
    actors.toggleRow = toggle;
    actors.toggle = toggle._switch;
    const embedded = new St.Button({style_class: 'button', label: 'embedded'});
    actors.root.add_child(embedded);
    actors.embedded = embedded;
    const slider = new Slider(0.5);
    slider.width = 100;
    actors.root.add_child(slider);
    actors.slider = slider;
    return actors;
}

// External module loading can race startup-complete in a headless shell.
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        runTests().catch(error => logError(error, 'Open Bar regression failed'))
            .finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
export async function run() {
    await new Promise(() => {}); // init owns execution/shutdown, not perf-helper
}

async function runTests() {
    await Scripting.sleep(500);
    const dir = GLib.getenv('OPENBAR_TEST_DIR');
    const source = Gio.SettingsSchemaSource.new_from_directory(
        `${dir}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
    const settings = new Gio.Settings({settings_schema: source.lookup('org.gnome.shell.extensions.openbar', false)});
    settings.set_boolean('menustyle', true);
    settings.set_boolean('apply-menu-shell', true);
    settings.set_boolean('apply-all-shell', false);
    settings.set_boolean('autofg-menu', false);
    settings.set_boolean('autohg-menu', false);
    settings.set_boolean('smbgoverride', true);
    settings.set_strv('mfgcolor', ['0.8', '0.2', '0.3']);
    settings.set_strv('mbgcolor', ['0.1', '0.2', '0.3']);
    settings.set_strv('smbgcolor', ['0.3', '0.2', '0.1']);
    settings.set_strv('mhcolor', ['0.2', '0.7', '0.4']);
    const obar = Object.create(Openbar.prototype);
    Object.assign(obar, {
        _settings: settings,
        _intSettings: new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}),
        _hcSettings: new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.interface'}),
        main: Main, gnomeVersion: parseInt(Config.PACKAGE_VERSION),
        obarRunDir: Gio.File.new_for_path(dir), msSVG: true, mhSVG: true, smfgSVG: true,
    });
    const file = Gio.File.new_for_path(`${dir}/stylesheet.css`);
    const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    const button = new PanelMenu.Button(0.0, 'Open Bar regression');
    button.add_child(new St.Label({text: 'Test'}));
    Main.panel.addToStatusArea('openbar-regression', button);
    const unrelated = new St.BoxLayout({style_class: 'candidate-popup-content'});
    const unrelatedRow = new St.Button({style_class: 'popup-menu-item', label: 'unrelated'});
    unrelated.add_child(unrelatedRow);
    Main.uiGroup.add_child(unrelated);
    const unrelatedDefault = snapshot({unrelated, unrelatedRow});
    const unrelatedMenu = new PopupMenu.PopupMenu(button, 0.0, St.Side.TOP);
    Main.uiGroup.add_child(unrelatedMenu.actor);
    const outside = populate(unrelatedMenu);
    const outsideDefault = snapshot(outside);
    let loaded = false;
    async function reload() {
        if (loaded)
            theme.unload_stylesheet(file);
        await reloadStyle(obar, null);
        theme.load_stylesheet(file);
        loaded = true;
    }
    try {
        // Global mode provides the existing palette and cascade as the oracle.
        await reload();
        let actors = populate(button.menu);
        const expected = snapshot(actors);
        assert(JSON.stringify(expected.root[1]) !== JSON.stringify(expected.subrow[1]),
            'Fixture must distinguish root and submenu hover colors');
        button.menu.removeAll();
        settings.set_boolean('apply-menu-shell', false);
        await reload();
        obar.panelBoxes = [[{child: button}]];
        obar.applyMenuStyles(Main.panel, true);
        await Scripting.sleep(50); // DBusMenu creates rows on a later idle
        actors = populate(button.menu);
        assert(!actors.root.has_style_class_name('openmenu'), 'Late row must be untagged');
        compare(snapshot(actors), expected, 'late scoped');
        print('PASS: late rows, submenus, sections, separators, toggles and buttons in all states');
        compare(snapshot({unrelated, unrelatedRow}), unrelatedDefault, 'unrelated/IBus scope');
        compare(snapshot(outside), outsideDefault, 'untagged popup');
        obar.applyMenuStyles(Main.panel, true);
        compare(snapshot(actors), expected, 'rescanned scoped');
        print('PASS: rescan does not change palette or cascade');
        button.menu.open();
        await Scripting.sleep(50);
        button.menu.removeAll();
        actors = populate(button.menu);
        compare(snapshot(actors), expected, 'open repopulation');
        button.menu.close();
        actors.root.destroy();
        actors.root = new PopupMenu.PopupMenuItem('replacement');
        button.menu.addMenuItem(actors.root, 0);
        compare(snapshot({root: actors.root}), {root: expected.root}, 'closed replacement');
        obar.applyMenuStyles(Main.panel, false);
        const disabled = snapshot({root: actors.root});
        assert(JSON.stringify(disabled.root) !== JSON.stringify(expected.root), 'Removing menu classes must remove scoped styling');
        obar.applyMenuStyles(Main.panel, true);
        compare(snapshot({root: actors.root}), {root: expected.root}, 're-enabled');
        for (let cycle = 0; cycle < 3; cycle++) {
            obar.applyMenuStyles(Main.panel, false);
            obar.applyMenuStyles(Main.panel, true);
            compare(snapshot({root: actors.root}), {root: expected.root}, 'repeated toggle');
        }
        button.menu.removeAll();
        actors = populate(button.menu);
        obar.applyMenuStyles(Main.panel, true);
        compare(snapshot(actors), expected, 'populated before scan');
        // Removing a late subtree from the tagged root removes its new styles.
        obar.applyMenuStyles(Main.panel, false);
        obar.applyMenuStyles(Main.panel, true);
        const detached = new PopupMenu.PopupMenuItem('detached');
        button.menu.addMenuItem(detached);
        compare(snapshot({root: detached}), {root: expected.root}, 'before reparent');
        button.menu.box.remove_child(detached);
        unrelatedMenu.box.add_child(detached);
        compare(snapshot({root: detached}), {root: outsideDefault.root}, 'after reparent');
        detached.destroy();
        settings.set_boolean('menustyle', false);
        await reload();
        compare(snapshot({root: actors.root}), disabled, 'menustyle off');
        settings.set_boolean('menustyle', true);
        settings.set_boolean('apply-all-shell', true);
        await reload();
        compare(snapshot(actors), expected, 'apply-all-shell');
    } finally {
        button.destroy();
        unrelated.destroy();
        unrelatedMenu.destroy();
        if (loaded)
            theme.unload_stylesheet(file);
        await Scripting.sleep(50);
    }
    print(`PASS: ${checks} assertions`);
    GLib.file_set_contents(`${dir}/result`, `PASS: ${checks} assertions\n`);
}
