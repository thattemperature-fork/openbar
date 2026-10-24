import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import {sleep, generator, check, write, finish} from './round2-gtk-common.js';

function descendants(w) {
    const all = [w];
    for (let c = w.get_first_child(); c; c = c.get_next_sibling()) all.push(...descendants(c));
    return all;
}
function serialize(w) {
    const snapshot = new Gtk.Snapshot();
    const paintable = new Gtk.WidgetPaintable({widget: w});
    paintable.snapshot(snapshot, paintable.get_intrinsic_width(), paintable.get_intrinsic_height());
    return new TextDecoder().decode(snapshot.to_node().serialize().get_data());
}
finish('traffic4', async () => {
    Adw.init();
    const gen = await generator();
    gen.settings.set_boolean('traffic-light', true);
    gen.settings.set_int('headerbar-hint', 80);
    gen.settings.set_boolean('hbar-gtk3only', false);
    await gen.generate();
    const provider = new Gtk.CssProvider();
    provider.connect('parsing-error', (_p, _s, e) => check(false, `GTK4 parser: ${e.message}`));
    provider.load_from_path(`${GLib.get_user_config_dir()}/gtk-4.0/gtk.css`);
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER);
    Gtk.Settings.get_default().gtk_decoration_layout = ':minimize,maximize,close';
    const win = new Adw.Window({default_width: 650, default_height: 350});
    const toolbar = new Adw.ToolbarView(), header = new Adw.HeaderBar();
    toolbar.add_top_bar(header); toolbar.set_content(new Gtk.Label({label: 'Native stretched headerbar'}));
    win.set_content(toolbar); win.present(); await sleep(600);
    const result = {};
    async function sample(name, backdrop = false, hover = false) {
        const buttons = descendants(header).filter(w => w instanceof Gtk.Button && ['minimize', 'maximize', 'close'].some(c => w.has_css_class(c)));
        check(buttons.length === 3, `${name}: all three native controls present`);
        result[name] = [];
        write(`traffic4-${name}-header.txt`, serialize(header));
        for (const b of buttons) {
            b.unset_state_flags(Gtk.StateFlags.BACKDROP | Gtk.StateFlags.PRELIGHT);
            if (backdrop) b.set_state_flags(Gtk.StateFlags.BACKDROP, false);
            if (hover) b.set_state_flags(Gtk.StateFlags.PRELIGHT, false);
            await sleep(500);
            const render = serialize(b), kind = ['minimize', 'maximize', 'close'].find(c => b.has_css_class(c));
            write(`traffic4-${name}-${kind}.txt`, render);
            const bounds = [...render.matchAll(/rounded-clip\s*\{\s*clip: ([^;]+);/g)].map(m => m[1]);
            // GSK rounded clips containing the actual fill, not the icon or hit target.
            const circle = bounds.some(v => /(?:^| )20 20 \/ 10(?:$| )/.test(v));
            check(circle && !/\bscale\(/.test(render) && !bounds.some(v => /20 34 \/ 10/.test(v)), `${name}: ${kind} actual painted 20px circle, not capsule`);
            check(b.get_height() > b.get_width(), `${name}: ${kind} retains stretched native hit target`);
            const stateColor = backdrop && !hover ? 'rgb(192,191,192)' : ({close: 'rgb(252,96,96)', maximize: 'rgb(68,186,128)', minimize: 'rgb(238,175,80)'})[kind];
            check(hover && !backdrop ? !render.includes(stateColor) : render.includes(stateColor), `${name}: ${kind} state color`);
            if (hover) check(render.includes('fill {') || render.includes('text {') || render.includes('mask {') || render.includes('texture {'), `${name}: ${kind} hover icon visible`);
            result[name].push({kind, width: b.get_width(), height: b.get_height(), bounds});
        }
    }
    await sample('normal'); await sample('backdrop', true);
    await sample('hover', false, true); await sample('backdrop-hover', true, true);
    win.maximize(); await sleep(500);
    check(win.is_maximized(), 'native compositor maximized the Adw window');
    await sample('maximized'); await sample('maximized-backdrop', true);
    write('traffic4-result.json', JSON.stringify(result, null, 2));
    win.destroy();
});
