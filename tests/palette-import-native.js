// Real exported lifecycle, native decoder and Gio.Settings signal graph.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const dir=GLib.getenv('OPENBAR_PALETTE_IMPORT_DIR');
let count=0;
function assert(value,label){if(!value)throw Error(label);count++;print(`PASS ${label}`);}
const read=path=>new TextDecoder().decode(GLib.file_get_contents(path)[1]);
export async function run(){await new Promise(()=>{});}
export function init(){GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,()=>{
    test().then(()=>GLib.file_set_contents(`${dir}/result`,`PASS Shell ${Config.PACKAGE_VERSION}: palette-import: ${count} assertions\n`))
        .catch(e=>logError(e,'palette import lifecycle failed')).finally(()=>global.context.terminate());return GLib.SOURCE_REMOVE;
});}
async function test(){
    await Scripting.sleep(1000);
    const path=`${dir}/openbar@neuromorph`;
    const {default:Openbar}=await import(`file://${path}/extension.js`);
    const AutoThemes=await import(`file://${path}/autothemes.js`);
    const meta={...JSON.parse(read(`${path}/metadata.json`)),path,dir:Gio.File.new_for_path(path)};
    const background=new Gio.Settings({schema_id:'org.gnome.desktop.background'});
    const system=new Gio.Settings({schema_id:'org.gnome.desktop.interface'});
    for(const [mode,color] of [['dark',0xb03040ff],['light',0x3070b0ff]]){
        const pix=GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB,false,8,512,512);pix.fill(color);pix.savev(`${dir}/${mode}.png`,'png',[],[]);
        background.set_string(mode==='dark'?'picture-uri-dark':'picture-uri',Gio.File.new_for_path(`${dir}/${mode}.png`).get_uri());
    }
    system.set_string('color-scheme','prefer-dark');await Scripting.sleep(500);
    const obar=new Openbar(meta);obar.enable();await Scripting.sleep(900);
    const settings=obar._settings, external=obar.getSettings();
    const nativeDecode=obar.getPaletteFromImage.bind(obar);
    assert(obar._paletteCounts?.dark?.[0]>0&&obar._paletteCounts?.light?.[0]>0,'real enable generates both native palettes');
    for(const mode of ['dark','light']){
        let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);
        obar.getPaletteFromImage=(uri,cancel)=>{const result=nativeDecode(uri,cancel);if(uri.endsWith(`/${mode}.png`)){started();return result.then(async value=>{await gate;return value;});}return result;};
        const pending=obar.backgroundPalette();await entered;
        const cancel=obar._paletteCancellable;
        system.set_string('color-scheme',mode==='dark'?'default':'prefer-dark');
        // Let Shell's own background transition settle while decode delivery is held.
        await Scripting.sleep(400);
        assert(!cancel.is_cancelled(),`${mode} decode survives real mode copy`);
        release();await pending;
        assert(obar._paletteCounts?.dark?.[0]>0&&obar._paletteCounts?.light?.[0]>0,`${mode} decode publishes both populations after mode copy`);
        const selected=system.get_string('color-scheme')==='prefer-dark'?'dark':'light';
        assert(settings.get_int('count1')===obar._paletteCounts[selected][0],`${mode} decode counts match actual desktop mode`);
        obar.getPaletteFromImage=nativeDecode;
    }
    for(const mode of ['dark','light']){
        let release,started;const gate=new Promise(r=>release=r),entered=new Promise(r=>started=r);
        // Start native async I/O unchanged; gate only delivery to force race ordering.
        obar.getPaletteFromImage=(uri,cancel)=>{const result=nativeDecode(uri,cancel);if(uri.endsWith(`/${mode}.png`)){started();return result.then(async value=>{await gate;return value;});}return result;};
        const pending=obar.backgroundPalette();await entered;
        external.set_boolean('import-export',true);
        external.set_strv(`${mode}-palette1`,['11','22','33']);
        external.set_int('count1',0);external.set_int('count12',100);
        system.set_string('color-scheme',mode==='dark'?'default':'prefer-dark');
        // Let Shell's own background transition settle while decode delivery is held.
        await Scripting.sleep(400);
        const before=JSON.stringify(Array.from({length:12},(_,i)=>[settings.get_strv(`${mode}-palette${i+1}`),settings.get_int(`count${i+1}`)]));
        release();await pending;
        const after=JSON.stringify(Array.from({length:12},(_,i)=>[settings.get_strv(`${mode}-palette${i+1}`),settings.get_int(`count${i+1}`)]));
        assert(before===after,`${mode} in-flight native decode cannot overwrite active import`);
        assert(obar._paletteCounts?.[mode]===undefined,`${mode} imported palette invalidates population cache`);
        external.set_boolean('import-export',false);
        obar.onModeChange();
        assert(settings.get_int('count1')===0&&settings.get_int('count12')===100,`${mode} real mode change retains imported counts (count1=${settings.get_int('count1')}, count12=${settings.get_int('count12')}, cache=${JSON.stringify(obar._paletteCounts)})`);
        obar.getPaletteFromImage=nativeDecode;
    }
    await obar.backgroundPalette();
    assert(obar._paletteCounts?.dark?.[0]>0&&obar._paletteCounts?.light?.[0]>0,'own publication preserves both caches');
    // prefs reset keeps URI keys and uses reset() under the same import/export flag.
    external.set_boolean('import-export',true);
    for(const key of external.list_keys())if(!['import-export','default-font','bguri','dark-bguri','light-bguri'].includes(key))external.reset(key);
    external.set_boolean('import-export',false);
    const resetCounts=Array.from({length:12},(_,i)=>settings.get_int(`count${i+1}`));
    obar.onModeChange();
    assert(JSON.stringify(resetCounts)===JSON.stringify(Array.from({length:12},(_,i)=>settings.get_int(`count${i+1}`))),'prefs-equivalent real reset survives mode change');
    await obar.backgroundPalette();
    let enteredImport=false,lateWrites=0;
    const observer=settings.connect('changed',(_s,key)=>{
        if(key==='dark-palette1'&&!enteredImport){enteredImport=true;external.set_boolean('import-export',true);}
        else if(enteredImport&&/^(?:(?:dark-|light-)?palette|count)\d+$/.test(key))lateWrites++;
    });
    // Use a new file not watched by Shell's wallpaper manager, so this
    // assertion isolates synchronous import rather than a filesystem refresh.
    const pix=GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB,false,8,512,512);pix.fill(0x40c060ff);pix.savev(`${dir}/replacement.png`,'png',[],[]);
    external.set_string('dark-bguri',Gio.File.new_for_path(`${dir}/replacement.png`).get_uri());
    await obar.backgroundPalette();settings.disconnect(observer);
    assert(enteredImport&&lateWrites===0,`synchronous real settings import callback stops publication at next write (entered=${enteredImport}, late=${lateWrites})`);
    external.set_boolean('import-export',false);
    await obar.backgroundPalette();
    const retained=obar._paletteCounts;
    external.set_boolean('import-export',true);external.set_strv('dark-palette1',external.get_strv('dark-palette1'));external.set_boolean('import-export',false);
    assert(obar._paletteCounts===retained,'export-only pause does not discard counts');
    obar.disable();await obar._styleCleanup;await Scripting.sleep(500);
    assert(obar._settings===null,'real disable releases settings');
}
