// Private native actors + actual extension methods. No live desktop integration.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
const dir = GLib.getenv('OPENBAR_TEST_DIR');
let checks = 0;
const failures = [];
function assert(ok, message) { if (!ok) throw Error(message); checks++; }
function styled(actor, add, label) { assert(actor.has_style_class_name('openmenu') === add, label); }
export async function run() { await new Promise(() => {}); }
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        test().then(() => {
            if (failures.length) throw Error(JSON.stringify(failures));
            GLib.file_set_contents(`${dir}/result`, `PASS round2-traversal Shell ${Config.PACKAGE_VERSION}: ${checks} assertions\n`);
        }).catch(e => logError(e, 'round2-traversal failed')).finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
async function test() {
    await Scripting.sleep(1000);
    const path = `${dir}/openbar@neuromorph`;
    const {default: Openbar} = await import(`file://${path}/extension.js`);
    const [, bytes] = GLib.file_get_contents(`${path}/metadata.json`);
    const o = new Openbar({...JSON.parse(new TextDecoder().decode(bytes)), path, dir: Gio.File.new_for_path(path)});
    o._settings = o.getSettings(); o._settings.set_boolean('menustyle', true);
    o.gnomeVersion = Number.parseInt(Config.PACKAGE_VERSION); o.addedSignal = 'child-added'; o.removedSignal = 'child-removed';
    const connections = [];
    o._connections = {
        connect(obj, signal, cb) { connections.push({obj, signal, id: obj.connect(signal, cb)}); },
        disconnect(obj, signal) {
            for (let n = connections.length - 1; n >= 0; n--) if (connections[n].obj === obj && connections[n].signal === signal) {
                obj.disconnect(connections[n].id); connections.splice(n, 1);
            }
        },
    };
    async function caseTest(name, fn) {
        try { await fn(); print(`PASS ${name}`); }
        catch (e) { failures.push({name, error: String(e), stack: e.stack}); print(`FAIL ${name}: ${e}`); }
    }
    const button = new PanelMenu.Button(0, 'round2-submenu');
    const direct = new St.Widget(), outer = new St.BoxLayout(), nested = new St.Widget();
    direct.menu = {}; nested.menu = {}; outer.add_child(nested);
    button.menu.box.add_child(direct); button.menu.box.add_child(outer);
    const valid = new PopupMenu.PopupSubMenuMenuItem('valid submenu');
    valid.menu.addMenuItem(new PopupMenu.PopupMenuItem('valid child'));
    button.menu.addMenuItem(valid);
    const section = new PopupMenu.PopupMenuSection();
    const legacyNested = new PopupMenu.PopupSubMenuMenuItem('section submenu');
    legacyNested.menu.addMenuItem(new PopupMenu.PopupMenuItem('section child'));
    section.addMenuItem(legacyNested); button.menu.addMenuItem(section);
    try {
        await caseTest('malformed direct submenu retains valid siblings', () => {
            o.panelBoxes = [[{child: button}]];
            for (const add of [true, false]) {
                o.applyMenuStyles(Main.panel, add);
                styled(direct, add, `direct malformed actor styled ${add}`);
                styled(valid.menu.box, add, `valid submenu box ${add}`);
                styled(valid.menu.box.get_first_child(), add, `valid submenu child ${add}`);
            }
        });
        direct.menu = null;
        await caseTest('malformed nested submenu retains legacy section submenu', () => {
            for (const add of [true, false]) {
                o.applyMenuStyles(Main.panel, add);
                styled(nested, add, `nested malformed actor styled ${add}`);
                styled(legacyNested.menu.box, add, `legacy nested submenu box ${add}`);
                styled(legacyNested.menu.box.get_first_child(), add, `legacy nested submenu child ${add}`);
            }
        });
        const date = Main.panel.statusArea.dateMenu, list = date._messageList;
        const originalParent = list.get_parent(), originalIndex = originalParent.get_children().indexOf(list);
        const destination = new St.BoxLayout(); Main.uiGroup.add_child(destination);
        for (const relocated of [false, true]) {
            await caseTest(`native DateMenu ${relocated ? 'relocated' : 'stock'}`, async () => {
                if (relocated) { originalParent.remove_child(list); destination.add_child(list); }
                o.panelBoxes = [[{child: date}]];
                try {
                    for (const add of [true, false, true, false]) {
                        o.applyMenuStyles(Main.panel, add);
                        styled(list, add, `notification list ${relocated}/${add}`);
                        styled(list._placeholder, add, `placeholder ${relocated}/${add}`);
                        styled(list._clearButton, add, `Clear ${relocated}/${add}`);
                        styled(list._messageView, add, `MessageView ${relocated}/${add}`);
                        styled(date._calendar, add, `calendar ${relocated}/${add}`);
                        styled(date._date, add, `today ${relocated}/${add}`);
                        styled(date._displaysSection, add, `displays ${relocated}/${add}`);
                        styled(date._eventsItem, add, `events ${relocated}/${add}`);
                        styled(date._clocksItem, add, `clocks ${relocated}/${add}`);
                        styled(date._weatherItem, add, `weather ${relocated}/${add}`);
                        const days = date._calendar.get_children().filter(a => a.has_style_class_name('calendar-day'));
                        assert(days.length > 0, 'native day cells exist');
                        days.forEach(a => styled(a, add, `day cell ${relocated}/${add}`));
                        await Scripting.sleep(300);
                        styled(list._clearButton, add, 'Clear survives calendar callback');
                    }
                } finally {
                    if (relocated) { destination.remove_child(list); originalParent.insert_child_at_index(list, originalIndex); }
                }
            });
        }
        destination.destroy();
        await caseTest('all native panel menus including QuickSettings', () => {
            o.panelBoxes = [Main.panel._leftBox, Main.panel._centerBox, Main.panel._rightBox];
            for (const add of [true, false, true, false]) {
                o.applyMenuStyles(Main.panel, add);
                let roots = 0;
                for (const box of o.panelBoxes) for (const bin of box) {
                    const b = bin.child;
                    if (b instanceof PanelMenu.Button && b.menu?.box) {
                        roots++; styled(b.menu.box, add, `native menu root ${b.constructor.name}/${add}`);
                        if (b.menu._boxPointer) styled(b.menu._boxPointer, add, 'native pointer');
                    }
                }
                assert(roots >= 3, 'all native panel menus visited');
                styled(Main.panel.statusArea.quickSettings.menu.box, add, 'QuickSettings root');
            }
        });
    } finally {
        nested.menu = null; direct.menu = null;
        o._cancelTimeouts();
        for (const {obj, id} of connections) obj.disconnect(id);
        button.destroy();
    }
}
