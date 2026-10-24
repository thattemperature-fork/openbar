import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../openbar@neuromorph/extension.js',import.meta.url),'utf8');
function method(name, next) {
    const start=source.search(new RegExp(`    (?:async )?${name}\\(`));
    const rest=source.slice(start + 1);
    const end=rest.search(new RegExp(`    (?:async )?${next}\\(`));
    return source.slice(start, start + 1 + end);
}
let passed=0, failed=0;
async function test(name,fn) { try {await fn();passed++;} catch(e) {failed++;console.error(`FAIL ${name}: ${e.message}`);} }
function fixture({quantize, pixbuf}={}) {
    let now=0, next=1; const timers=new Map(), values=new Map(), requests=[], applications=[];
    class Cancellable { cancel(){this.cancelled=true;} is_cancelled(){return !!this.cancelled;} }
    const Gio={Cancellable, File:{new_for_uri: uri=>({get_path:()=>uri, read_async:(priority,cancel,callback)=>callback({read_finish:()=>({close_async:(priority,c,cb)=>cb({close_finish:()=>true})})},{})})}};
    const GdkPixbuf={Pixbuf:{new_from_file_at_size:()=>pixbuf, new_from_stream_at_scale_async:(stream,w,h,aspect,cancel,cb)=>{requests.push(cancel);cb(null,{});},new_from_stream_finish:()=>pixbuf}};
    const context=vm.createContext({Gio,GdkPixbuf,GLib:{PRIORITY_DEFAULT:0},console,Quantize:{quantize:quantize??(()=>null)},AutoThemes:{autoApplyBGPalette:(o,mode)=>applications.push({mode,counts:[...o._paletteCounts?.[mode]??[]]})},setTimeout:(fn,ms)=>{let id=next++;timers.set(id,{fn,time:now+ms});return id;},clearTimeout:id=>timers.delete(id)});
    const methods = method('_queueTimeout','_cancelTimeouts')+method('getPaletteFromImage','backgroundPalette')+method('backgroundPalette','_injectToFunction')+method('updateBguri','connectPrimaryBGChanged');
    const Palette=vm.runInContext(`(class {${methods}})`,context), obar=new Palette();
    values.set('color-scheme','prefer-dark'); values.set('picture-uri','file:///light.png');values.set('picture-uri-dark','file:///dark.png');
    values.set('bguri','file:///dark.png');values.set('dark-bguri','file:///dark.png');values.set('light-bguri','file:///light.png');
    values.set('autotheme-dark','Dark');values.set('autotheme-light','Light');values.set('autotheme-refresh',true);
    const writes=[];
    const settings={get_string:k=>values.get(k)??'',get_boolean:k=>values.get(k)??false,get_int:k=>values.get(k)??0,get_strv:k=>values.get(k),set_string:(k,v)=>{values.set(k,v);writes.push([k,v]);},set_boolean:(k,v)=>{values.set(k,v);writes.push([k,v]);},set_strv:(k,v)=>{values.set(k,v);writes.push([k,v]);},set_int:(k,v)=>{values.set(k,v);writes.push([k,v]);}};
    Object.assign(obar,{_settings:settings,_bgSettings:settings,_intSettings:settings,colorScheme:'prefer-dark'});
    const refreshed=[]; obar.updatePanelStyle=()=>refreshed.push(values.get('bguri'));
    function advance(ms) {const end=now+ms; for(;;){const entries=[...timers].filter(([,t])=>t.time<=end).sort((a,b)=>a[1].time-b[1].time);if(!entries.length)break;const[id,t]=entries[0];now=t.time;timers.delete(id);t.fn();}now=end;}
    return {obar,values,writes,timers,advance,refreshed,requests,applications};
}
await test('rapid changes retain final request',()=>{
    const f=fixture();f.obar.updateBguri();f.advance(250);
    f.values.set('picture-uri-dark','file:///final.png');f.obar.updateBguri();f.advance(6000);
    assert.equal(f.values.get('bguri'),'file:///final.png');assert.equal(f.timers.size,0);
});
await test('same URI content change refreshes again',()=>{
    const f=fixture();f.obar.updateBguri();f.advance(250);f.obar.updateBguri();f.advance(6000);
    assert.equal(f.refreshed.length,2);
});
await test('mode change does not discard newest wallpaper',()=>{
    const f=fixture();f.values.set('color-scheme','default');f.obar.updateBguri();f.advance(6000);
    assert.equal(f.values.get('bguri'),'file:///light.png');
});
await test('burst is coalesced to latest values',()=>{
    const f=fixture();for(let i=0;i<20;i++){f.values.set('picture-uri-dark',`file:///${i}.png`);f.obar.updateBguri();f.advance(50);} f.advance(6000);
    assert.equal(f.values.get('bguri'),'file:///19.png');assert.equal(f.writes.filter(([k])=>k==='bguri').length,1);
});
await test('padded RGB rows and paired descending sort',async()=>{
    const pixbuf={n_channels:3,get_width:()=>1,get_height:()=>3,get_rowstride:()=>4,get_pixels:()=>new Uint8Array([200,20,20,99,20,200,20,99,20,20,200])};
    let pixels;
    const f=fixture({pixbuf,quantize:p=>{pixels=p;return{palette:()=>[[1,2,3],[4,5,6],[7,8,9]],colorCounts:()=>[2,7,3]};}});
    const [palette,counts]=await f.obar.getPaletteFromImage('file:///padded.png');
    assert.deepEqual(JSON.parse(JSON.stringify(pixels)),[[200,20,20],[20,200,20],[20,20,200]]);
    assert.deepEqual(JSON.parse(JSON.stringify(palette)),[[4,5,6],[7,8,9],[1,2,3]]);assert.deepEqual([...counts],[7,3,2]);
});
await test('separate mode populations and no stale short-palette slots',async()=>{
    const f=fixture();f.obar.getPaletteFromImage=uri=>uri.includes('dark')?[[[100,20,30]],[80]]:[[[20,100,30],[30,20,100]],[3,1]];
    await f.obar.backgroundPalette();
    assert.deepEqual(f.applications.map(a=>a.counts.slice(0,2)),[[80,0],[3,1]]);
    assert.equal(f.values.get('count1'),80,'main counts belong to current mode, not last processed mode');
    assert.equal(f.values.get('count2'),0);assert.deepEqual([...f.values.get('dark-palette12')],['100','20','30']);
});
await test('older asynchronous generation cannot overwrite latest',async()=>{
    const f=fixture();let resolveFirst;let calls=0;
    f.obar.getPaletteFromImage=()=>++calls===1?new Promise(resolve=>resolveFirst=resolve):Promise.resolve([[[50,60,70]],[4]]);
    const first=f.obar.backgroundPalette();await Promise.resolve();const latest=f.obar.backgroundPalette();await latest;
    resolveFirst([[[200,100,20]],[900]]);await first;
    assert.deepEqual([...f.values.get('dark-palette1')],['50','60','70']);
});
await test('invalid or empty result does not partially write a palette',async()=>{
    const f=fixture();f.obar.getPaletteFromImage=()=>[null,null];await f.obar.backgroundPalette();assert.equal(f.writes.length,0);
});
await test('same URI deduplicates only inside one refresh',async()=>{
    const f=fixture();f.values.set('light-bguri',f.values.get('dark-bguri'));
    let calls=0;f.obar.getPaletteFromImage=()=>{calls++;return[[[40,50,60]],[4]];};
    await f.obar.backgroundPalette();assert.equal(calls,1);await f.obar.backgroundPalette();assert.equal(calls,2);
});
await test('cancellation hook prevents publication and clears per-mode data',async()=>{
    const f=fixture();let resolve;f.obar.getPaletteFromImage=()=>new Promise(r=>resolve=r);
    const pending=f.obar.backgroundPalette();await Promise.resolve();const cancel=f.obar._paletteCancellable;
    f.obar.cancelBackgroundPalette();resolve([[[40,50,60]],[4]]);await pending;
    assert.ok(cancel.is_cancelled());assert.equal(f.writes.length,0);assert.equal(f.obar._paletteCounts,null);
});
await test('invalid results preserve existing palette',async()=>{
    for(const result of [[[[30,40,50]],[-1]],[[[30,40,50]],[0]],[[[30,40,50]],[NaN]],[[[300,40,50]],[4]],[[[30,40,50]],[1,2]]]) {
        const f=fixture();f.obar.getPaletteFromImage=()=>result;await f.obar.backgroundPalette();assert.equal(f.writes.length,0);
    }
});
await test('settings failure is reported without an unhandled rejection',async()=>{
    const f=fixture();f.obar.getPaletteFromImage=()=>[[[30,40,50]],[4]];
    f.obar._settings.set_strv=()=>{throw Error('injected settings failure');};
    await f.obar.backgroundPalette();assert.equal(f.obar._paletteCancellable,null);
});
await test('new wallpaper event invalidates an in-flight older decode immediately',async()=>{
    const f=fixture();f.values.set('light-bguri','');let resolve;f.obar.getPaletteFromImage=()=>new Promise(r=>resolve=r);
    const old=f.obar.backgroundPalette();await Promise.resolve();f.obar.updateBguri();
    resolve([[[200,30,40]],[9]]);await old;
    assert.equal(f.writes.length,0,'older decode cannot publish during the trailing debounce');
});
await test('cancelled generation never starts decoding the other mode',async()=>{
    const f=fixture();let reject,calls=0;
    f.obar.getPaletteFromImage=()=>{calls++;return new Promise((resolve,r)=>reject=r);};
    const pending=f.obar.backgroundPalette();await Promise.resolve();f.obar.cancelBackgroundPalette();
    reject(Error('cancelled'));await Promise.race([pending,new Promise((_,r)=>setTimeout(()=>r(Error('cancelled generation hung on second decode')),50))]);
    assert.equal(calls,1);
});
console.log(`palette-wallpaper: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
