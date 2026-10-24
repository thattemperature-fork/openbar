// Real extension lifecycle and native PanelMenu.setMenu on an existing button.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
const dir = GLib.getenv('OPENBAR_TEST_DIR');
let checks = 0;
function assert(value, label) {
    if (!value) throw new Error(label);
    checks++;
    print(`PASS ${label}`);
}
function color(actor) {
    actor.add_style_pseudo_class('hover');
    const node = actor.get_theme_node();
    const result = [node.get_background_color().to_string(), node.get_foreground_color().to_string()];
    actor.remove_style_pseudo_class('hover');
    return JSON.stringify(result);
}
function replace(button, label) {
    const menu = new PopupMenu.PopupMenu(button, 0.0, St.Side.TOP);
    const row = new PopupMenu.PopupMenuItem(label);
    menu.addMenuItem(row);
    // No manual tagging and no replacing the button/container/panel actor.
    assert(!menu.box.has_style_class_name('openmenu'), 'replacement starts untagged');
    button.setMenu(menu);
    return {menu, row};
}
export async function run() { await new Promise(() => {}); }
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        test().then(() => GLib.file_set_contents(`${dir}/result`,
            `PASS Shell ${Config.PACKAGE_VERSION}: menu-modern-root: ${checks} assertions\n`))
            .catch(error => logError(error, 'menu-modern-root regression failed'))
            .finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
async function test() {
    await Scripting.sleep(1000);
    const path = `${dir}/openbar@neuromorph`;
    const {default: Openbar} = await import(`file://${path}/extension.js`);
    const Styles = await import(`file://${path}/stylesheets.js`);
    const [, bytes] = GLib.file_get_contents(`${path}/metadata.json`);
    const metadata = {...JSON.parse(new TextDecoder().decode(bytes)), path, dir: Gio.File.new_for_path(path)};
    const wallpaper = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 32, 32);
    wallpaper.fill(0x5380b0ff);
    wallpaper.savev(`${dir}/wallpaper.png`, 'png', [], []);
    const background = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
    const uri = Gio.File.new_for_path(`${dir}/wallpaper.png`).get_uri();
    background.set_string('picture-uri', uri);
    background.set_string('picture-uri-dark', uri);
    const schema = Gio.SettingsSchemaSource.new_from_directory(`${path}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
    const settings = new Gio.Settings({settings_schema: schema.lookup(metadata['settings-schema'], false)});
    settings.set_boolean('menustyle', true);
    settings.set_boolean('apply-menu-shell', false);
    settings.set_boolean('autofg-menu', false);
    settings.set_boolean('autohg-menu', false);
    settings.set_strv('mfgcolor', ['0.8', '0.2', '0.3']);
    settings.set_strv('mhcolor', ['0.2', '0.7', '0.4']);
    await Scripting.sleep(500);
    const button = new PanelMenu.Button(0.0, 'Root replacement fixture');
    button.add_child(new St.Label({text: 'Root test'}));
    Main.panel.addToStatusArea('menu-modern-root', button);
    const original = new PopupMenu.PopupMenuItem('original');
    button.menu.addMenuItem(original);
    const unrelated = new PanelMenu.Button(0.0, 'Not in panel');
    const obar = new Openbar(metadata);
    let retainedButton = null;
    let retainedBin = null;
    try {
        for (let cycle = 1; cycle <= 2; cycle++) {
            obar.enable();
            if (retainedBin) {
                Main.uiGroup.remove_child(retainedBin);
                Main.panel._rightBox.add_child(retainedBin);
                await Scripting.sleep(300);
                const retained = replace(retainedButton, 'reattached after disable');
                assert(retained.menu.box.has_style_class_name('openmenu'), 'surviving off-panel button reconnects with new extension lifecycle');
            }
            await Scripting.sleep(6500);
            const first = cycle === 1 ? original : button.menu._getMenuItems()[0];
            assert(button.menu.box.has_style_class_name('openmenu'), `cycle ${cycle}: original root tagged`);
            const expected = color(first);
            const oldButton = button;
            const oldParent = button.get_parent();
            let current = replace(button, 'replacement root');
            assert(button === oldButton && button.get_parent() === oldParent, 'same native button and panel container retained');
            assert(current.menu.box.has_style_class_name('openmenu'), 'whole replacement menu root discovered immediately');
            assert(current.menu._boxPointer.has_style_class_name('openmenu'), 'replacement box pointer styled');
            assert(color(current.row) === expected, 'replacement row theme-node palette matches original');
            button.menu.open();
            await Scripting.sleep(100);
            current = replace(button, 'replace while open');
            assert(color(current.row) === expected, 'open-menu root replacement styled');
            for (let i = 0; i < 3; i++) {
                obar.applyMenuStyles(Main.panel, true);
                current = replace(button, `rescan ${i}`);
                assert(color(current.row) === expected, 'repeated scans and replacements retain palette');
            }
            assert(obar._connections.connections.filter(c => c.obj === button && c.sig === 'menu-set').length === 1,
                'one menu-set subscription after repeated scans');
            button.setMenu(null);
            current = replace(button, 'after null menu');
            assert(color(current.row) === expected, 'null then real menu replacement styled');
            settings.set_boolean('menustyle', false);
            await Scripting.sleep(300);
            current = replace(button, 'disabled menustyle');
            assert(!current.menu.box.has_style_class_name('openmenu'), 'menustyle off does not tag replacement');
            settings.set_boolean('menustyle', true);
            // Completion is asynchronous; under concurrent compositor load a
            // fixed 300ms can still sample the previous menustyle=false CSS.
            if (!await Styles.reloadStyle(obar, obar))
                throw Error('menustyle enable stylesheet did not publish');
            current = replace(button, 'enabled menustyle');
            const actual = color(current.row);
            assert(actual === expected, `menustyle on reconnects replacement discovery (${actual} vs ${expected})`);
            const outside = replace(unrelated, 'outside panel');
            assert(!outside.menu.box.has_style_class_name('openmenu'), 'unrelated button outside panel stays untagged');
            const late = new PanelMenu.Button(0.0, 'Late panel button');
            late.add_child(new St.Label({text: 'Late'}));
            Main.panel.addToStatusArea(`menu-modern-late-${cycle}`, late);
            await Scripting.sleep(300);
            const lateRoot = replace(late, 'late button replacement');
            assert(lateRoot.menu.box.has_style_class_name('openmenu'), 'late panel button replacement discovered');
            late.destroy();
            if (cycle === 1) {
                retainedButton = new PanelMenu.Button(0.0, 'Retained off-panel button');
                retainedButton.add_child(new St.Label({text: 'Retained'}));
                Main.panel.addToStatusArea('menu-modern-retained', retainedButton);
                await Scripting.sleep(300);
                retainedBin = retainedButton.get_parent();
                Main.panel._rightBox.remove_child(retainedBin);
                Main.uiGroup.add_child(retainedBin);
            }
            await Scripting.sleep(600);
            obar.disable();
            assert(!current.menu.box.has_style_class_name('openmenu'), 'disable removes replacement root class');
            const post = replace(button, 'after full disable');
            assert(!post.menu.box.has_style_class_name('openmenu'), 'full disable disconnects menu-set callback');
            await Scripting.sleep(6500);
            assert(!post.menu.box.has_style_class_name('openmenu'), 'replacement remains unstyled after disable observation window');
        }
    } finally {
        if (obar._settings)
            obar.disable();
        retainedButton?.destroy();
        button.destroy();
        unrelated.destroy();
        await Scripting.sleep(400);
    }
}
