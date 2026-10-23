// Native DateMenu and real Openbar lifecycle; run only via the isolated runner.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

const dir = GLib.getenv('OPENBAR_TEST_DIR');
const mode = GLib.getenv('OPENBAR_TEST_MODE');
const results = [];
function assert(condition, message) {
    if (!condition)
        throw new Error(message);
    results.push(message);
    print(`PASS ${message}`);
}
function clearButton() {
    const date = Main.panel.statusArea.dateMenu;
    const list = date.menu.box.get_child_at_index(0).get_child_at_index(0).get_child_at_index(0);
    assert(list._clearButton && list.contains(list._clearButton), 'native Clear button exists in DateMenu');
    return list._clearButton;
}
function checkClass(actor, add, label) {
    assert(actor.has_style_class_name('openmenu') === add, label);
}
export async function run() {
    await new Promise(() => {});
}
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        test().then(() => {
            GLib.file_set_contents(`${dir}/result`,
                `PASS Shell ${Config.PACKAGE_VERSION}: ${mode}: ${results.length} assertions\n`);
        }).catch(error => logError(error, `Open Bar ${mode} regression failed`))
            .finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
async function test() {
    await Scripting.sleep(1000);
    const path = `${dir}/openbar@neuromorph`;
    const {default: Openbar} = await import(`file://${path}/extension.js`);
    const clear = clearButton();
    if (mode === 'date-menu') {
        const connections = [];
        const obar = Object.create(Openbar.prototype);
        Object.assign(obar, {
            gnomeVersion: Number.parseInt(Config.PACKAGE_VERSION),
            panelBoxes: [Main.panel._centerBox], addedSignal: 'child-added',
            msgLists: [], msgListIds: [],
            _connections: {
                connect(obj, signal, callback) {
                    connections.push({obj, signal, id: obj.connect(signal, callback)});
                },
                disconnect(obj, signal) {
                    for (let i = connections.length - 1; i >= 0; i--) {
                        if (connections[i].obj === obj && connections[i].signal === signal) {
                            obj.disconnect(connections[i].id);
                            connections.splice(i, 1);
                        }
                    }
                },
            },
        });
        try {
            for (const add of [true, false, true, false]) {
                obar.applyMenuStyles(Main.panel, add);
                checkClass(clear, add, `native Clear class immediately ${add}`);
                // Let the real calendar callback run, rather than cancelling it.
                await Scripting.sleep(350);
                checkClass(clear, add, `native Clear class after calendar callback ${add}`);
            }
        } finally {
            for (const {obj, id} of connections)
                obj.disconnect(id);
            if (obar.calendarTimeoutId)
                clearTimeout(obar.calendarTimeoutId);
        }
        return;
    }
    assert(mode === 'lifecycle', 'known lifecycle mode');
    const [, bytes] = GLib.file_get_contents(`${path}/metadata.json`);
    const metadata = {...JSON.parse(new TextDecoder().decode(bytes)), path,
        dir: Gio.File.new_for_path(path)};
    // A private desktop needs a real wallpaper: empty Nix schema defaults cause
    // unrelated getPaletteFromImage(null) errors. Exercise palette work, don't stub it.
    const wallpaper = GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB, false, 8, 32, 32);
    wallpaper.fill(0x5380b0ff);
    wallpaper.savev(`${dir}/wallpaper.png`, 'png', [], []);
    const background = new Gio.Settings({schema_id: 'org.gnome.desktop.background'});
    const uri = Gio.File.new_for_path(`${dir}/wallpaper.png`).get_uri();
    background.set_string('picture-uri', uri);
    background.set_string('picture-uri-dark', uri);
    await Scripting.sleep(500);
    const obar = new Openbar(metadata);
    // No lifecycle methods are replaced. Use real compiled schemas and defaults.
    for (let cycle = 1; cycle <= 2; cycle++) {
        print(`LIFECYCLE enable ${cycle}`);
        obar.enable();
        assert(Main.panel.has_style_class_name('openbar'), `cycle ${cycle}: panel enabled`);
        checkClass(clear, true, `cycle ${cycle}: Clear styled on enable`);
        // Includes delayed menu refresh (1s), background connection (2s), Fitts (5s).
        await Scripting.sleep(6500);
        checkClass(clear, true, `cycle ${cycle}: Clear remains styled after async enable`);
        assert(obar.enableStyleTimeoutId === null, `cycle ${cycle}: delayed style refresh completed`);
        assert(obar.fittsEnableTimeoutId === null, `cycle ${cycle}: Fitts setup completed`);
        for (const add of [false, true]) {
            obar._settings.set_boolean('menustyle', add);
            await Scripting.sleep(350);
            checkClass(clear, add, `cycle ${cycle}: menustyle setting ${add}`);
        }
        print(`LIFECYCLE disable ${cycle}`);
        obar.disable();
        assert(!Main.panel.has_style_class_name('openbar'), `cycle ${cycle}: panel disabled`);
        checkClass(clear, false, `cycle ${cycle}: Clear unstyled on disable`);
        assert(obar._settings === null && obar._connections === null, `cycle ${cycle}: references cleared`);
        // Do not hide or cancel post-disable work: runner rejects logged JS errors.
        await Scripting.sleep(6500);
        checkClass(clear, false, `cycle ${cycle}: Clear remains unstyled after async disable`);
    }
}
