// External MPRIS test service: real session-bus discovery and property delivery.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
const dir = GLib.getenv('OPENBAR_TEST_DIR');
const loop = new GLib.MainLoop(null, false);
const rootXml = `<node><interface name="org.mpris.MediaPlayer2">
<method name="Raise"/><method name="Quit"/>
<property name="CanQuit" type="b" access="read"/><property name="CanRaise" type="b" access="read"/>
<property name="HasTrackList" type="b" access="read"/><property name="Identity" type="s" access="read"/>
<property name="DesktopEntry" type="s" access="read"/>
<property name="SupportedUriSchemes" type="as" access="read"/><property name="SupportedMimeTypes" type="as" access="read"/>
</interface></node>`;
const playerXml = `<node><interface name="org.mpris.MediaPlayer2.Player">
<method name="PlayPause"/><method name="Next"/><method name="Previous"/>
<property name="PlaybackStatus" type="s" access="read"/><property name="Metadata" type="a{sv}" access="read"/>
<property name="CanPlay" type="b" access="read"/><property name="CanPause" type="b" access="read"/>
<property name="CanGoNext" type="b" access="read"/><property name="CanGoPrevious" type="b" access="read"/>
<property name="CanControl" type="b" access="read"/>
</interface></node>`;
const root = {CanQuit: true, CanRaise: true, HasTrackList: false, Identity: 'Open Bar MPRIS transport', DesktopEntry: '',
    SupportedUriSchemes: [], SupportedMimeTypes: [], Raise() {}, Quit() { loop.quit(); }};
const player = {PlaybackStatus: 'Playing', CanPlay: true, CanPause: true, CanGoNext: true, CanGoPrevious: false, CanControl: true,
    Metadata: {'xesam:title': new GLib.Variant('s', 'Open Bar bus track'), 'xesam:artist': new GLib.Variant('as', ['Bus artist'])},
    PlayPause() { GLib.file_set_contents(`${dir}/mpris-click`, 'PlayPause'); }, Next() {}, Previous() {}};
const rootObject = Gio.DBusExportedObject.wrapJSObject(rootXml, root);
const playerObject = Gio.DBusExportedObject.wrapJSObject(playerXml, player);
rootObject.export(Gio.DBus.session, '/org/mpris/MediaPlayer2');
playerObject.export(Gio.DBus.session, '/org/mpris/MediaPlayer2');
const owner = Gio.bus_own_name_on_connection(Gio.DBus.session, 'org.mpris.MediaPlayer2.openbarTest', Gio.BusNameOwnerFlags.NONE, null, null);
let previous = '';
GLib.timeout_add(GLib.PRIORITY_DEFAULT, 50, () => {
    if (!GLib.file_test(`${dir}/mpris-command`, GLib.FileTest.EXISTS))
        return GLib.SOURCE_CONTINUE;
    const [, bytes] = GLib.file_get_contents(`${dir}/mpris-command`);
    const command = new TextDecoder().decode(bytes);
    if (command !== previous) {
        previous = command;
        if (command === 'metadata') {
            player.Metadata = {...player.Metadata, 'xesam:title': new GLib.Variant('s', 'Updated bus track')};
            playerObject.emit_property_changed('Metadata', new GLib.Variant('a{sv}', player.Metadata));
        } else if (command === 'off' || command === 'on') {
            player.CanPlay = command === 'on';
            playerObject.emit_property_changed('CanPlay', new GLib.Variant('b', player.CanPlay));
        } else if (command === 'quit') {
            loop.quit();
        }
    }
    return GLib.SOURCE_CONTINUE;
});
loop.run();
Gio.bus_unown_name(owner);
rootObject.unexport();
playerObject.unexport();
