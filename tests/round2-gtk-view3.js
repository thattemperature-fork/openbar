import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib';
import {root, sleep, generator, check, write, finish, contrast} from './round2-gtk-common.js';

finish('view3', async () => {
    Gtk.init(null);
    const gen = await generator();
    const win = new Gtk.Window({default_width: 500, default_height: 300});
    const tree = new Gtk.TreeView();
    win.add(tree); win.show_all(); await sleep(250);
    const ctx = tree.get_style_context();
    const states = [Gtk.StateFlags.NORMAL, Gtk.StateFlags.SELECTED,
        Gtk.StateFlags.SELECTED | Gtk.StateFlags.FOCUSED,
        Gtk.StateFlags.SELECTED | Gtk.StateFlags.BACKDROP];
    const sample = () => states.map(state => {
        const fg = ctx.get_color(state), bg = ctx.get_background_color(state);
        return {state, fg: fg.to_string(), bg: bg.to_string(), contrast: contrast(fg, bg)};
    });
    const before = sample();
    gen.interfaceSettings.set_string('color-scheme', 'default');
    await gen.generate();
    const provider = new Gtk.CssProvider();
    provider.connect('parsing-error', (_p, _section, error) => check(false, `GTK3 parser: ${error.message}`));
    provider.load_from_path(`${GLib.get_user_config_dir()}/gtk-3.0/gtk.css`);
    Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER);
    await sleep(350);
    const after = sample();
    for (let i = 1; i < states.length; i++) {
        check(after[i].bg === before[i].bg && after[i].fg === before[i].fg,
            `TreeView native selected state ${states[i]} preserved`);
        check(after[i].contrast >= 3, `TreeView selected state ${states[i]} contrast >= 3`);
    }
    Gtk.StyleContext.remove_provider_for_screen(Gdk.Screen.get_default(), provider);
    Gtk.Settings.get_default().gtk_application_prefer_dark_theme = true;
    await sleep(250);
    await gen.generate('issue85-settings.txt');
    provider.load_from_path(`${GLib.get_user_config_dir()}/gtk-3.0/gtk.css`);
    Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER);
    await sleep(350);
    const issue85 = sample();
    check(issue85[0].bg === 'rgb(245,245,245)', '#85 exported light view still themed on native dark');
    check(issue85[0].contrast >= 4.5, '#85 normal foreground matches generated light view');
    ctx.set_state(Gtk.StateFlags.BACKDROP);
    check(contrast(ctx.get_color(Gtk.StateFlags.BACKDROP), ctx.get_background_color(Gtk.StateFlags.BACKDROP)) >= 4.5,
        '#85 unselected backdrop contrast');
    write('view3-result.json', JSON.stringify({gtk: `${Gtk.get_major_version()}.${Gtk.get_minor_version()}.${Gtk.get_micro_version()}`, before, after, issue85}, null, 2));
    win.destroy();
});
