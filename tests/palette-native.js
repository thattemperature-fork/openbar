// Native Shell palette tests; only via tests/palette-native.sh in a private compositor.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const dir=GLib.getenv('OPENBAR_PALETTE_DIR');
const sleep=ms=>Scripting.sleep(ms);
let assertions=0;
function assert(value,message) { if(!value)throw Error(message); assertions++;print(`PASS ${message}`); }
export async function run(){await new Promise(()=>{});}
export function init(){GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,()=>{
    test().catch(e=>logError(e,'palette-native failed')).finally(()=>global.context.terminate());return GLib.SOURCE_REMOVE;
});}
async function test(){
    await sleep(1000);
    const path=`${dir}/openbar@neuromorph`;
    const {default:Openbar}=await import(`file://${path}/extension.js`);
    const Quantize=await import(`file://${path}/quantize.js`);
    const AutoThemes=await import(`file://${path}/autothemes.js`);
    const [,metadataBytes]=GLib.file_get_contents(`${path}/metadata.json`);
    const metadata={...JSON.parse(new TextDecoder().decode(metadataBytes)),path,dir:Gio.File.new_for_path(path)};
    const obar=new Openbar(metadata);
    obar._settings=obar.getSettings();
    obar._intSettings=new Gio.Settings({schema_id:'org.gnome.desktop.interface'});
    obar._bgSettings=new Gio.Settings({schema_id:'org.gnome.desktop.background'});
    const settings=obar._settings;
    obar._intSettings.set_string('color-scheme','prefer-dark');
    settings.set_string('autotheme-dark','Dark');settings.set_string('autotheme-light','Light');
    settings.set_boolean('autotheme-refresh',true);
    const uri=filename=>Gio.File.new_for_path(`${dir}/${filename}`).get_uri();
    const solid=(filename,rgba)=>{const p=GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB,false,8,17,23);p.fill(rgba);p.savev(`${dir}/${filename}`,'png',[],[]);};
    solid('dark.png',0x903040ff);solid('light.png',0x30a050ff);
    settings.set_string('dark-bguri',uri('dark.png'));settings.set_string('light-bguri',uri('light.png'));
    await obar.backgroundPalette();
    assert(obar._paletteCounts.dark.reduce((a,b)=>a+b,0)>0,'dark populations generated');
    assert(obar._paletteCounts.light.reduce((a,b)=>a+b,0)>0,'light populations generated');
    assert(settings.get_strv('dark-palette1').join()!==settings.get_strv('light-palette1').join(),'native dark/light palettes differ');
    assert(!settings.get_boolean('pause-reload'),'real auto-theme leaves reload unpaused');
    assert(settings.get_boolean('autotheme-font'),'real auto-theme applied');
    const before=settings.get_strv('dark-palette1').join();
    solid('dark.png',0x3050c0ff);await obar.backgroundPalette();
    assert(settings.get_strv('dark-palette1').join()!==before,'same URI overwritten content is decoded again');
    obar._intSettings.set_string('color-scheme','default');AutoThemes.onModeChange(obar);
    assert(settings.get_int('count1')===obar._paletteCounts.light[0],'native mode switch copies matching populations');
    // PPM width=255 gives a padded RGB row; height=256 prevents upscaling.
    const header=new TextEncoder().encode('P6\n255 256\n255\n');
    const ppm=new Uint8Array(header.length+255*256*3);ppm.set(header);
    for(let y=0;y<256;y++)for(let x=0;x<255;x++) {
        const c=y<85?[200,20,20]:y<170?[20,200,20]:[20,20,200];
        ppm.set(c,header.length+(y*255+x)*3);
    }
    GLib.file_set_contents(`${dir}/padded.ppm`,ppm);
    const [padded,counts]=await obar.getPaletteFromImage(uri('padded.ppm'));
    assert(counts.reduce((a,b)=>a+b,0)===Math.ceil(255*256/7),'native padded RGB includes exactly the sampled pixels');
    assert(padded.some(c=>c[0]>150)&&padded.some(c=>c[1]>150)&&padded.some(c=>c[2]>150),'native padded RGB retains red, green and blue');
    const cancel=new Gio.Cancellable();cancel.cancel();
    let cancelled=false;try{await obar.getPaletteFromImage(uri('dark.png'),cancel);}catch(e){cancelled=e.matches(Gio.io_error_quark(),Gio.IOErrorEnum.CANCELLED);}
    assert(cancelled,'native async read respects cancellation');
    settings.set_boolean('autotheme-refresh',false);
    settings.set_string('dark-bguri',uri('missing.png'));settings.set_string('light-bguri',uri('light.png'));
    await obar.backgroundPalette();
    assert(settings.get_strv('light-palette1').length===3,'one missing wallpaper does not prevent other mode');
    // Schedule actual native timers; a second event after the old 200ms update
    // would have been lost for five seconds before the fix.
    let refreshes=0;obar.updatePanelStyle=()=>refreshes++;
    obar._bgSettings.set_string('picture-uri',uri('light.png'));
    obar._bgSettings.set_string('picture-uri-dark',uri('dark.png'));
    obar.updateBguri();await sleep(250);
    obar._bgSettings.set_string('picture-uri',uri('padded.ppm'));obar.updateBguri();await sleep(300);
    assert(settings.get_string('bguri')===uri('padded.ppm'),'native timer retains final wallpaper');
    obar.updateBguri();await sleep(300);assert(refreshes===1,'native unchanged URI forces refresh');
    // Native compositor repaint cadence during a measured 4K decoding workload.
    const width=3840,height=2160,data=new Uint8Array(width*height*3);let state=17;
    for(let i=0;i<data.length;i++){state=(Math.imul(state,1664525)+1013904223)>>>0;data[i]=state>>>24;}
    const image=GdkPixbuf.Pixbuf.new_from_bytes(new GLib.Bytes(data),GdkPixbuf.Colorspace.RGB,false,8,width,height,width*3);
    image.savev(`${dir}/large.png`,'png',[],[]);
    const [,bytes]=GLib.file_get_contents(`${dir}/baseline-extension.js`);const source=new TextDecoder().decode(bytes);
    const method=source.slice(source.indexOf('    getPaletteFromImage('),source.indexOf('    backgroundPalette('));
    const Baseline=new Function('Gio','GdkPixbuf','Quantize',`return class {${method}}`)(Gio,GdkPixbuf,Quantize);
    async function measure(label,owner){
        let lastFrame=null,maxFrameGapMs=0,frameCount=0,lastTick=GLib.get_monotonic_time(),maxEventLoopGapMs=0;
        const paint=global.stage.connect('after-paint',()=>{const now=GLib.get_monotonic_time();if(lastFrame!==null)maxFrameGapMs=Math.max(maxFrameGapMs,(now-lastFrame)/1000);lastFrame=now;frameCount++;});
        const tick=GLib.timeout_add(GLib.PRIORITY_DEFAULT,1,()=>{const now=GLib.get_monotonic_time();maxEventLoopGapMs=Math.max(maxEventLoopGapMs,(now-lastTick)/1000);lastTick=now;global.stage.queue_redraw();return GLib.SOURCE_CONTINUE;});
        await sleep(100);const start=GLib.get_monotonic_time();
        const [palette,populations]=await owner.getPaletteFromImage(uri('large.png'));
        const elapsedMs=(GLib.get_monotonic_time()-start)/1000;
        await sleep(100);GLib.source_remove(tick);global.stage.disconnect(paint);
        assert(palette.length===populations.length&&palette.length>0,`${label}: palette/count consistency`);
        assert(frameCount>2,`${label}: native frames were rendered`);
        return{label,elapsedMs,maxFrameGapMs,maxEventLoopGapMs,frameCount,samples:populations.reduce((a,b)=>a+b,0)};
    }
    const measurements=[await measure('baseline',new Baseline()),await measure('fixed',obar),await measure('fixed-warm',obar)];
    assert(measurements[1].samples<=10000,'quantization sample budget is bounded');
    print(JSON.stringify(measurements,null,2));
    settings.set_string('dark-bguri',uri('large.png'));
    settings.set_string('light-bguri',uri('large.png'));
    const previous=settings.get_strv('dark-palette1').join();
    const pending=obar.backgroundPalette();
    const inFlight=obar._paletteCancellable;
    obar.cancelBackgroundPalette();
    await pending;
    assert(inFlight.is_cancelled(),'native in-flight generation is cancelled by cleanup hook');
    assert(settings.get_strv('dark-palette1').join()===previous,'cancelled native generation cannot publish');
    assert(obar._paletteCancellable===null&&obar._paletteCounts===null,'cancellation hook releases palette state');
    GLib.file_set_contents(`${dir}/result`,JSON.stringify({shell:Config.PACKAGE_VERSION,assertions,measurements},null,2));
}
