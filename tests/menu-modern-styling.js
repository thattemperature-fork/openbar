// Native DateMenu/MessageView integration in a private compositor.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import Openbar from '../openbar@neuromorph/extension.js';
import {reloadStyle} from '../openbar@neuromorph/stylesheets.js';

const dir = GLib.getenv('OPENBAR_TEST_DIR');
let checks = 0;
function assert(value, message) {
    if (!value)
        throw new Error(message);
    checks++;
    print(`PASS ${message}`);
}
function rgba(actor) {
    const node = actor.get_theme_node();
    return [node.get_foreground_color().to_string(), node.get_background_color().to_string()];
}
function same(actor, expected, label) {
    assert(JSON.stringify(rgba(actor)) === JSON.stringify(expected), `${label}: ${rgba(actor)} == ${expected}`);
}
function find(root, style) {
    if (root.has_style_class_name?.(style))
        return root;
    for (const child of root.get_children()) {
        const result = find(child, style);
        if (result)
            return result;
    }
    return null;
}
async function until(fn, label) {
    for (let i = 0; i < 100; i++) {
        const value = fn();
        if (value)
            return value;
        await Scripting.sleep(50);
    }
    throw new Error(`Timed out: ${label}`);
}
function source(title) {
    const result = new MessageTray.Source({title});
    Main.messageTray.add(result);
    return result;
}
function notify(src, title) {
    const result = new MessageTray.Notification({source: src, title, body: 'Open Bar native regression body'});
    src.addNotification(result);
    return result;
}
export async function run() { await new Promise(() => {}); }
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        test().then(() => GLib.file_set_contents(`${dir}/result`,
            `PASS Shell ${Config.PACKAGE_VERSION}: menu-modern: ${checks} assertions\n`))
            .catch(error => logError(error, 'menu-modern regression failed'))
            .finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
async function command(argv) {
    const proc = Gio.Subprocess.new(argv, Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
    return new Promise((resolve, reject) => proc.communicate_utf8_async(null, null, (p, res) => {
        try {
            const [, out, err] = p.communicate_utf8_finish(res);
            if (!p.get_successful())
                throw new Error(`${argv}: ${err}`);
            resolve(out);
        } catch (error) { reject(error); }
    }));
}
async function transport(obar, view, expected) {
    const notifications = Gio.Subprocess.new([
        `${GLib.getenv('OPENBAR_SHELL_PACKAGE')}/share/gnome-shell/org.gnome.Shell.Notifications`,
    ], Gio.SubprocessFlags.NONE);
    const mpris = Gio.Subprocess.new(['gjs', '-m',
        Gio.File.new_for_uri(import.meta.url).get_parent().get_child('menu-modern-mpris-service.js').get_path(),
    ], Gio.SubprocessFlags.NONE);
    const bus = ['gdbus', 'call', '--session', '--dest', 'org.freedesktop.Notifications',
        '--object-path', '/org/freedesktop/Notifications'];
    let notificationId;
    try {
        await until(() => Gio.DBus.session.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus',
            'org.freedesktop.DBus', 'NameHasOwner', new GLib.Variant('(s)', ['org.freedesktop.Notifications']),
            null, Gio.DBusCallFlags.NONE, -1, null).deepUnpack()[0], 'notification service owns public name');
        const response = await command([...bus, '--method', 'org.freedesktop.Notifications.Notify',
            'Open Bar bus notification', '0', '', 'Bus delivered notification', 'Transport smoke body', '[]', '{}', '0']);
        notificationId = Number(response.match(/uint32 (\d+)/)[1]);
        assert(notificationId > 0, 'real external Notify call returned notification ID');
        const group = await until(() => [...view._notificationSourceToGroup.values()].find(g =>
            [...g._notificationToMessage.keys()].some(n => n.title === 'Bus delivered notification')), 'D-Bus delivered group');
        const message = [...group._notificationToMessage.values()].find(m => m.title === 'Bus delivered notification');
        same(message, expected, 'real D-Bus delivered notification styled');
        await command([...bus, '--method', 'org.freedesktop.Notifications.CloseNotification', `${notificationId}`]);
        await until(() => ![...view._notificationSourceToGroup.values()].includes(group), 'bus notification removed');
        assert(true, 'real D-Bus CloseNotification removed group');
        const media = await until(() => [...view._playerToMessage.values()].find(m => m.title === 'Open Bar bus track'), 'MPRIS-discovered native media');
        same(media, expected, 'real MPRIS-discovered media styled');
        assert(media._bodyLabel.text === 'Bus artist', 'MPRIS artist metadata delivered');
        media._playPauseButton.emit('clicked', 1);
        await until(() => GLib.file_test(`${dir}/mpris-click`, GLib.FileTest.EXISTS), 'MPRIS PlayPause called');
        assert(true, 'media control invoked real external D-Bus PlayPause');
        const control = media._playPauseButton;
        assert(rgba(control)[0] === expected[0], 'media control custom foreground');
        const referenceMessage = new St.BoxLayout({style_class: 'message openmenu'});
        const reference = new St.Button({style_class: 'message-media-control'});
        referenceMessage.add_child(reference);
        Main.uiGroup.add_child(referenceMessage);
        for (const state of ['', 'hover', 'focus', 'insensitive']) {
            reference.set_style_pseudo_class(state);
            control.set_style_pseudo_class(state);
            same(control, rgba(reference), `media control ${state || 'normal'} matches notification palette`);
        }
        control.set_style_pseudo_class('');
        referenceMessage.destroy();
        const icon = media._icon;
        Main.panel.statusArea.dateMenu.menu.open();
        await until(() => icon.has_style_class_name('message-themed-icon'), 'native symbolic media icon loaded');
        assert(rgba(icon)[0] === expected[0], 'modern symbolic media icon custom foreground');
        assert(rgba(icon)[1] === '#19334cff', `modern symbolic media icon custom background: ${rgba(icon)} ${icon.get_style_class_name()}`);
        GLib.file_set_contents(`${dir}/mpris-command`, 'metadata');
        await until(() => media.title === 'Updated bus track', 'MPRIS property change');
        same(media, expected, 'updated media retains custom palette');
        GLib.file_set_contents(`${dir}/mpris-command`, 'off');
        await until(() => view._playerToMessage.size === 0, 'CanPlay false removes media');
        assert(true, 'MPRIS CanPlay false removes native media');
        GLib.file_set_contents(`${dir}/mpris-command`, 'on');
        const replacement = await until(() => [...view._playerToMessage.values()][0], 'CanPlay true recreates media');
        same(replacement, expected, 'recreated media styled');
        obar.applyMenuStyles(Main.panel, false);
        assert(JSON.stringify(rgba(replacement)) !== JSON.stringify(expected), 'disable restores native media palette');
        obar.applyMenuStyles(Main.panel, true);
        same(replacement, expected, 're-enable media styled');
        GLib.file_set_contents(`${dir}/mpris-command`, 'quit');
        await until(() => view._playerToMessage.size === 0, 'MPRIS disappearance removes media');
        assert(true, 'MPRIS bus-name removal cleans up native media');
    } finally {
        notifications.force_exit();
        mpris.force_exit();
        await Scripting.sleep(400);
    }
}
async function test() {
    await Scripting.sleep(1000);
    const schemaSource = Gio.SettingsSchemaSource.new_from_directory(`${dir}/schemas`, Gio.SettingsSchemaSource.get_default(), false);
    const settings = new Gio.Settings({settings_schema: schemaSource.lookup('org.gnome.shell.extensions.openbar', false)});
    settings.set_boolean('menustyle', true);
    settings.set_boolean('apply-menu-shell', false);
    settings.set_boolean('autofg-menu', false);
    settings.set_boolean('autohg-menu', false);
    settings.set_boolean('smbgoverride', true);
    settings.set_double('mbgalpha', 1.0);
    settings.set_strv('mfgcolor', ['0.8', '0.2', '0.3']);
    settings.set_strv('mbgcolor', ['0.1', '0.2', '0.3']);
    settings.set_strv('smbgcolor', ['0.3', '0.2', '0.1']);
    settings.set_strv('mhcolor', ['0.2', '0.7', '0.4']);
    const connections = [];
    const obar = Object.create(Openbar.prototype);
    Object.assign(obar, {
        _settings: settings,
        _intSettings: new Gio.Settings({schema_id: 'org.gnome.desktop.interface'}),
        _hcSettings: new Gio.Settings({schema_id: 'org.gnome.desktop.a11y.interface'}),
        main: Main, gnomeVersion: parseInt(Config.PACKAGE_VERSION),
        obarRunDir: Gio.File.new_for_path(dir), msSVG: true, mhSVG: true, smfgSVG: true,
        panelBoxes: [Main.panel._centerBox], addedSignal: 'child-added',
        msgLists: [], msgListIds: [],
        _connections: {
            connect(obj, signal, callback) {
                connections.push({obj, signal, id: obj.connect(signal, (actor, param) => callback(actor, signal, param))});
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
    // Real St actors using the pre-48 section/bin shape; not an old Shell runtime.
    const oldList = new St.BoxLayout();
    const section = new St.BoxLayout();
    section._list = new St.BoxLayout();
    section.add_child(section._list);
    oldList.add_child(section);
    const oldMessage = new St.Label({text: 'Legacy message'});
    section._list.add_child(new St.Bin({child: oldMessage}));
    obar.applySectionStyles(oldList, true);
    assert(oldMessage.has_style_class_name('openmenu'), 'legacy section existing message tagged');
    const oldLate = new St.Label({text: 'Legacy late message'});
    section._list.add_child(new St.Bin({child: oldLate}));
    assert(oldLate.has_style_class_name('openmenu'), 'legacy section late message tagged');
    obar.applySectionStyles(oldList, false);
    assert(!oldMessage.has_style_class_name('openmenu') && !oldLate.has_style_class_name('openmenu'), 'legacy section cleanup removes classes');
    assert(!obar.msgListIds.some(Boolean), 'legacy section cleanup disconnects handler');
    oldList.destroy();
    const theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
    const file = Gio.File.new_for_path(`${dir}/stylesheet.css`);
    await reloadStyle(obar, null);
    theme.load_stylesheet(file);
    const date = Main.panel.statusArea.dateMenu;
    const list = date._messageList;
    const view = list._messageView;
    assert(view?.has_style_class_name('message-view'), 'native DateMenu MessageView found');
    const src = source('Open Bar existing');
    const first = notify(src, 'Existing notification');
    await Scripting.sleep(200);
    const group = view._notificationSourceToGroup.get(src);
    const message = group._notificationToMessage.get(first);
    assert(!!message, 'native existing group and message created');
    // Existing per-actor palette is an oracle, not a simulated CSS matcher.
    obar.applyMenuClass(message, true);
    const expected = rgba(message);
    message.add_style_pseudo_class('hover');
    const hover = rgba(message);
    message.remove_style_pseudo_class('hover');
    obar.applyMenuClass(message, false);
    const native = rgba(message);
    assert(JSON.stringify(native) !== JSON.stringify(expected), 'fixture differs from native palette');
    try {
        obar.applyMenuStyles(Main.panel, true);
        same(message, expected, 'existing grouped notification styled');
        const outside = new St.Button({style_class: 'message'});
        Main.uiGroup.add_child(outside);
        assert(JSON.stringify(rgba(outside)) !== JSON.stringify(expected), 'unrelated notification-shaped actor stays native');
        const bin = message.get_parent();
        bin.set_child(null);
        Main.uiGroup.add_child(message);
        assert(JSON.stringify(rgba(message)) !== JSON.stringify(expected), 'detached message loses scoped palette');
        Main.uiGroup.remove_child(message);
        bin.set_child(message);
        same(message, expected, 'reparented message recovers scoped palette');
        outside.destroy();
        const second = notify(src, 'Late notification in existing group');
        await Scripting.sleep(250);
        const late = group._notificationToMessage.get(second);
        same(late, expected, 'late message inside existing group styled');
        late.add_style_pseudo_class('hover');
        same(late, hover, 'late hovered notification styled');
        late.remove_style_pseudo_class('hover');
        // Exercise the native expansion/layout methods while the menu is closed;
        // the minimal desktop's empty calendar backend has zero-size paint nodes.
        await group.expand();
        assert(group.expanded, 'native group expanded');
        same(late, expected, 'expanded message styled');
        const collapse = group._unexpandButton;
        assert(rgba(collapse)[0] === expected[0], 'group collapse button uses custom foreground');
        assert(rgba(find(group, 'message-group-title'))[0] === expected[0], 'group header uses custom foreground');
        await group.collapse();
        assert(!group.expanded, 'native group collapsed');
        same(late, expected, 'collapsed message styled');
        const src2 = source('Open Bar late group');
        const third = notify(src2, 'Late group notification');
        await Scripting.sleep(250);
        const group2 = view._notificationSourceToGroup.get(src2);
        same(group2._notificationToMessage.get(third), expected, 'new group styled');
        src2.destroy();
        await Scripting.sleep(250);
        assert(!view._notificationSourceToGroup.has(src2), 'native group removed');
        second.destroy();
        await Scripting.sleep(250);
        assert(!group._notificationToMessage.has(second), 'native message removed');
        same(message, expected, 'surviving notification remains styled');
        date.menu.close();
        obar.applyMenuStyles(Main.panel, true);
        obar.applyMenuStyles(Main.panel, true);
        same(message, expected, 'repeated styling idempotent');
        assert(connections.filter(c => c.obj === view).length === 0, 'modern view needs no child observers');
        obar.applyMenuStyles(Main.panel, false);
        same(message, native, 'disable restores native notification palette');
        obar.applyMenuStyles(Main.panel, true);
        same(message, expected, 're-enable restores custom palette');
        await transport(obar, view, expected);
    } finally {
        obar.applyMenuStyles(Main.panel, false);
        src.destroy();
        if (obar.calendarTimeoutId)
            clearTimeout(obar.calendarTimeoutId);
        for (const {obj, id} of connections)
            obj.disconnect(id);
        theme.unload_stylesheet(file);
        await Scripting.sleep(300);
    }
}
