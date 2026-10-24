import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
export async function run() { await new Promise(() => {}); }
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        (async () => {
            const repo = GLib.getenv('OPENBAR_PREFS_REPO');
            const dir = GLib.getenv('OPENBAR_PREFS_DIR');
            const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDERR_MERGE});
            launcher.set_stdout_file_path(`${dir}/gtk.log`);
            launcher.setenv('WAYLAND_DISPLAY', GLib.getenv('WAYLAND_DISPLAY'), true);
            if (GLib.getenv('OPENBAR_PREFS_MODE') === 'transactions')
                launcher.setenv('GSETTINGS_BACKEND', 'dconf', true);
            const child = launcher.spawnv([GLib.getenv('OPENBAR_PREFS_GJS'), '-m', `${repo}/tests/prefs-native.js`]);
            await new Promise((resolve, reject) => child.wait_async(null, (p, r) => {
                try { resolve(p.wait_finish(r)); } catch (e) { reject(e); }
            }));
            const output = new TextDecoder().decode(GLib.file_get_contents(`${dir}/gtk.log`)[1]);
            print(output);
            if (!child.get_successful() || !output.includes('PASS preferences native regression complete') || output.includes('JS ERROR')) throw Error('GTK preferences regression failed');
            GLib.file_set_contents(`${dir}/result`, output);
        })().catch(logError).finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
