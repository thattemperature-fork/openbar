import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const root = GLib.getenv('OPENBAR_GTK_DIR');
export async function run() { await new Promise(() => {}); }
export function init() {
    GLib.idle_add(0, () => {
        test().catch(logError).finally(() => global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
async function test() {
    const launcher = new Gio.SubprocessLauncher({flags: Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_MERGE});
    launcher.setenv('WAYLAND_DISPLAY', GLib.getenv('WAYLAND_DISPLAY'), true);
    for (const suite of GLib.getenv('OPENBAR_GTK_SUITES').split(' ')) {
        launcher.setenv('XDG_CONFIG_HOME', `${root}/config-${suite}`, true);
        const proc = launcher.spawnv([GLib.getenv('OPENBAR_GTK_GJS'), '-m', `${GLib.getenv('OPENBAR_GTK_REPO')}/tests/round2-gtk-${suite}.js`]);
        const [, output] = await new Promise((resolve, reject) => proc.communicate_utf8_async(null, null, (p, result) => {
            try { resolve(p.communicate_utf8_finish(result)); } catch (error) { reject(error); }
        }));
        print(output);
        GLib.file_set_contents(`${root}/${suite}.log`, output);
        if (!proc.get_successful() || !Gio.File.new_for_path(`${root}/${suite}.ok`).query_exists(null) ||
            /JS ERROR:|CRITICAL|Theme parser error|FAIL/.test(output)) throw Error(`${suite} failed`);
    }
    GLib.file_set_contents(`${root}/complete.ok`, 'PASS native GTK suites\n');
}
