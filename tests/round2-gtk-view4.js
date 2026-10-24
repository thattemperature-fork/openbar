import Gtk from 'gi://Gtk?version=4.0';
import Gdk from 'gi://Gdk?version=4.0';
import GLib from 'gi://GLib';
import Adw from 'gi://Adw';
import {sleep, generator, check, write, finish} from './round2-gtk-common.js';

export function serialize(widget) {
    const snap = new Gtk.Snapshot();
    new Gtk.WidgetPaintable({widget}).snapshot(snap, widget.get_width(), widget.get_height());
    return new TextDecoder().decode(snap.to_node().serialize().get_data());
}
finish('view4', async () => {
    Adw.init();
    const gen = await generator();
    gen.interfaceSettings.set_string('color-scheme', 'prefer-dark');
    await gen.generate('issue135-settings.txt');
    const app = new Gtk.CssProvider();
    app.load_from_string('textview.note {background-color:rgb(255,0,0);color:rgb(0,0,0);} textview.note text {background-color:transparent;color:rgb(0,0,0);}');
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), app, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
    const provider = new Gtk.CssProvider();
    provider.connect('parsing-error', (_p, _s, e) => check(false, `GTK4 parser: ${e.message}`));
    provider.load_from_path(`${GLib.get_user_config_dir()}/gtk-4.0/gtk.css`);
    Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(), provider, Gtk.STYLE_PROVIDER_PRIORITY_USER);
    const win = new Adw.Window({default_width: 500, default_height: 300});
    const box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL});
    const label = new Gtk.Label({label: 'Native view-class label'}); label.add_css_class('view');
    const note = new Gtk.TextView({vexpand: true}); note.add_css_class('note'); note.get_buffer().set_text('Semantic note', -1);
    const generic = new Gtk.TextView({vexpand: true}); generic.get_buffer().set_text('Generic native editor', -1);
    box.append(label); box.append(note); box.append(generic); win.set_content(box); win.present(); await sleep(500);
    const labelRender = serialize(label), noteRender = serialize(note), genericRender = serialize(generic);
    write('view4-label-render.txt', labelRender); write('view4-note-render.txt', noteRender); write('view4-generic-render.txt', genericRender);
    check(!/\bcolor\s*\{/.test(labelRender), '#135 Label.view paints glyphs without background color node');
    check(noteRender.includes('color: rgb(255,0,0)'), 'application-priority semantic TextView red survives USER CSS');
    check(noteRender.includes('color: rgb(0,0,0)'), 'semantic TextView application foreground survives');
    // TextView has no standard distinction between semantic and generic content:
    // both are deliberately outside Open Bar direct view-background selectors.
    Gtk.StyleContext.remove_provider_for_display(Gdk.Display.get_default(), provider);
    await sleep(350);
    const genericNative = serialize(generic);
    check(genericNative === genericRender, 'generic TextView native styling remains outside direct override');
    write('view4-result.json', JSON.stringify({gtk: `${Gtk.get_major_version()}.${Gtk.get_minor_version()}.${Gtk.get_micro_version()}`, adw: `${Adw.get_major_version()}.${Adw.get_minor_version()}.${Adw.get_micro_version()}`}, null, 2));
    win.destroy();
});
