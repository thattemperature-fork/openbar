import Gtk from 'gi://Gtk?version=3.0';
import Gdk from 'gi://Gdk?version=3.0';
import GLib from 'gi://GLib';
import Cairo from 'cairo';
import {sleep, generator, check, write, finish} from './round2-gtk-common.js';

function descendants(w) {
    const children = [];
    if (w instanceof Gtk.Container) w.forall(child => children.push(child));
    return [w, ...children.flatMap(descendants)];
}
finish('traffic3', async () => {
    Gtk.init(null);
    const gen = await generator();
    gen.settings.set_boolean('traffic-light', true);
    await gen.generate();
    const provider = new Gtk.CssProvider();
    provider.connect('parsing-error', (_p, _s, e) => check(false, `GTK3 parser: ${e.message}`));
    provider.load_from_path(`${GLib.get_user_config_dir()}/gtk-3.0/gtk.css`);
    Gtk.StyleContext.add_provider_for_screen(Gdk.Screen.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER);
    const win = new Gtk.Window({default_width: 650, default_height: 350});
    const header = new Gtk.HeaderBar({show_close_button: true, decoration_layout: ':minimize,maximize,close'});
    win.set_titlebar(header); win.add(new Gtk.Label({label: 'GTK3 titlebutton fallback'}));
    win.show_all(); await sleep(500);
    const result = {};
    async function sample(name, backdrop = false) {
        const buttons = descendants(header).filter(w => w instanceof Gtk.Button && w.get_style_context().has_class('titlebutton'));
        check(buttons.length === 3, `${name}: GTK3 fallback three titlebuttons`);
        result[name] = [];
        for (const button of buttons) {
            const ctx = button.get_style_context();
            const kind = ['close', 'maximize', 'minimize'].find(c => ctx.has_class(c));
            button.unset_state_flags(Gtk.StateFlags.BACKDROP | Gtk.StateFlags.PRELIGHT);
            if (backdrop) button.set_state_flags(Gtk.StateFlags.BACKDROP, false);
            await sleep(500);
            const margin = ctx.get_margin(button.get_state_flags());
            const width = button.get_allocated_width() - margin.left - margin.right;
            const height = button.get_allocated_height() - margin.top - margin.bottom;
            const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, width, height), cr = new Cairo.Context(surface);
            Gtk.render_background(ctx, cr, 0, 0, width, height);
            const pixbuf = Gdk.pixbuf_get_from_surface(surface, 0, 0, width, height);
            pixbuf.savev(`${GLib.getenv('OPENBAR_GTK_DIR')}/traffic3-${name}-${kind}.png`, 'png', [], []);
            const pixels = pixbuf.get_pixels(), stride = pixbuf.get_rowstride(), n = pixbuf.get_n_channels();
            const pixel = (x, y) => Array.from(pixels.slice(y * stride + x * n, y * stride + x * n + n));
            const corner = pixel(0, 0), center = pixel(Math.floor(width / 2), Math.floor(height / 2));
            check(width === height && corner[3] === 0 && center[3] === 255, `${name}: GTK3 ${kind} square allocation and native circular paint`);
            const expected = backdrop ? [192,191,192] : {close:[252,96,96], maximize:[68,186,128], minimize:[238,175,80]}[kind];
            check(center.slice(0,3).every((v,i) => v === expected[i]), `${name}: GTK3 ${kind} state color`);
            result[name].push({kind, width, height, corner, center});
        }
    }
    await sample('normal'); await sample('backdrop', true);
    win.maximize(); await sleep(500);
    check((win.get_window().get_state() & Gdk.WindowState.MAXIMIZED) !== 0, 'GTK3 compositor maximized window');
    await sample('maximized'); await sample('maximized-backdrop', true);
    write('traffic3-result.json', JSON.stringify(result, null, 2));
    win.destroy();
});
