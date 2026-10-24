import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Quantize from '../openbar@neuromorph/quantize.js';
const directory = GLib.dir_make_tmp('openbar-palette-bench-XXXXXX');
const decoder = new TextDecoder();
const source = decoder.decode(GLib.file_get_contents(ARGV[0] ?? GLib.build_filenamev([GLib.get_current_dir(), 'openbar@neuromorph/extension.js']))[1]);
const method = source.slice(source.search(/    (?:async )?getPaletteFromImage\(/), source.search(/    (?:async )?backgroundPalette\(/));
let quantizeMs=0;
const measuredQuantize = {quantize(pixels, count) {
    const start=GLib.get_monotonic_time();
    const result=Quantize.quantize(pixels,count);
    quantizeMs=(GLib.get_monotonic_time()-start)/1000;
    return result;
}};
const Palette = new Function('Gio', 'GLib', 'GdkPixbuf', 'Quantize', `return class {${method}}`)(Gio, GLib, GdkPixbuf, measuredQuantize);
const extension = new Palette();
const width = 3840, height = 2160;
let state = 17;
const data = new Uint8Array(width*height*3);
for (let i=0;i<data.length;i++) { state = (Math.imul(state,1664525)+1013904223)>>>0; data[i] = state>>>24; }
const pixbuf = GdkPixbuf.Pixbuf.new_from_bytes(new GLib.Bytes(data), GdkPixbuf.Colorspace.RGB, false, 8, width, height, width*3);
const loop = new GLib.MainLoop(null, false);
GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
    (async () => {
        const results = [];
        for (const format of ['png', 'jpeg']) {
            const path = `${directory}/wallpaper.${format}`;
            pixbuf.savev(path, format, [], []);
            let last = GLib.get_monotonic_time(), maxGap = 0;
            const heartbeat = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1, () => {
                const now = GLib.get_monotonic_time(); maxGap = Math.max(maxGap,(now-last)/1000); last=now; return GLib.SOURCE_CONTINUE;
            });
            const started = GLib.get_monotonic_time();
            const [palette, counts] = await extension.getPaletteFromImage(Gio.File.new_for_path(path).get_uri());
            const elapsedMs = (GLib.get_monotonic_time()-started)/1000;
            await new Promise(resolve => GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2, () => { resolve(); return GLib.SOURCE_REMOVE; }));
            GLib.source_remove(heartbeat);
            const decodedStart = GLib.get_monotonic_time();
            GdkPixbuf.Pixbuf.new_from_file_at_size(path, 1000, -1);
            const synchronousDecodeMs = (GLib.get_monotonic_time()-decodedStart)/1000;
            results.push({format, elapsedMs, quantizeMs, maxEventLoopGapMs:maxGap, synchronousDecodeMs, paletteSize:palette?.length, sampledCount:counts?.reduce((a,b)=>a+b,0)});
        }
        print(JSON.stringify({directory,width,height,results},null,2));
    })().catch(e => {printerr(e.stack); imports.system.exitCode=1;}).finally(() => loop.quit());
    return GLib.SOURCE_REMOVE;
});
loop.run();
