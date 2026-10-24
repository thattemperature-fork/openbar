import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
export async function run() { await new Promise(() => {}); }
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        (async () => {
            const repo = GLib.getenv('OPENBAR_PREFS_REPO');
            const dir = GLib.getenv('OPENBAR_PREFS_DIR');
            const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE});
            launcher.setenv('WAYLAND_DISPLAY', GLib.getenv('WAYLAND_DISPLAY'), true);
            const child = launcher.spawnv([GLib.getenv('OPENBAR_PREFS_GJS'), '-m', `${repo}/tests/prefs-native.js`]);
            const [, output] = await new Promise((resolve, reject) => child.communicate_utf8_async(null, null, (p, r) => {
                try { resolve(p.communicate_utf8_finish(r)); } catch (e) { reject(e); }
            }));
            print(output);
            GLib.file_set_contents(`${dir}/gtk.log`, output);
            if (!child.get_successful() || !output.includes('PASS preferences native regression complete') || output.includes('JS ERROR')) throw Error('GTK preferences regression failed');
            GLib.file_set_contents(`${dir}/result`, output);
        })().catch(logError).finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
