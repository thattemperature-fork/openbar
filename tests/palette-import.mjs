import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const root = new URL('../openbar@neuromorph/', import.meta.url);
const source = await readFile(new URL('extension.js', root), 'utf8');
const moduleURL = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const utils = moduleURL(await readFile(new URL('utils.js', root), 'utf8'));
const AutoThemes = await import(moduleURL((await readFile(new URL('autothemes.js', root), 'utf8')).replace("'./utils.js'", JSON.stringify(utils))));
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const methods = section('    async backgroundPalette(', '    _injectToFunction(') +
    section('    updatePanelStyle(', '        // Window-Max bar settings') + '\n    }';
class Cancellable { cancel() { this.cancelled = true; } is_cancelled() { return !!this.cancelled; } }
function fixture() {
    const values = new Map(Object.entries({'dark-bguri':'file:///dark.png', 'light-bguri':'', 'color-scheme':'prefer-dark', 'autotheme-dark':'Dark', 'autotheme-light':'Light', bartype:'Mainland'}));
    for (let i=1;i<=12;i++) {
        values.set('count'+i, 0);
        for (const prefix of ['', 'dark-', 'light-']) values.set(prefix+'palette'+i, ['30','60','90']);
    }
    const writes=[];
    const context=vm.createContext({Gio:{Cancellable}, AutoThemes, console, Main:{panel:{}}});
    const obar=new (vm.runInContext(`(class {${methods}})`, context))();
    const settings={get_string:k=>values.get(k)??'', get_boolean:k=>values.get(k)??false, get_int:k=>values.get(k)??0, get_strv:k=>values.get(k)??['0.2','0.4','0.6']};
    for (const kind of ['string','boolean','strv','int','double']) settings['set_'+kind]=(k,v)=>{
        const old=values.get(k); values.set(k,v); writes.push([k,v]);
        if (JSON.stringify(old)!==JSON.stringify(v)) obar.updatePanelStyle(settings,k);
        settings.after?.(k,v);
    };
    Object.assign(obar,{_settings:settings,_intSettings:settings});
    return {obar,settings,values,writes};
}
let passed=0,failed=0;
async function test(name,fn) { try { await fn(); passed++; } catch(e) {failed++;console.error(`FAIL ${name}: ${e.message}`);} }
await test('decode started before import cannot publish during or after import',async()=>{
    for (const finishImport of [false,true]) {
        const f=fixture(); let resolve;
        f.obar.getPaletteFromImage=()=>new Promise(r=>resolve=r);
        const pending=f.obar.backgroundPalette();
        f.settings.set_boolean('import-export',true);
        f.settings.set_strv('dark-palette1',['11','22','33']);
        if(finishImport) f.settings.set_boolean('import-export',false);
        const mark=f.writes.length;
        resolve([[[200,30,40]],[9]]); await pending;
        assert.equal(f.writes.length,mark,'stale decode wrote imported settings');
        assert.deepEqual([...f.values.get('dark-palette1')],['11','22','33']);
    }
});
await test('explicit refresh cannot publish while import active',async()=>{
    const f=fixture();f.settings.set_boolean('import-export',true);
    f.obar.getPaletteFromImage=()=>[[[200,30,40]],[9]];
    const mark=f.writes.length;await f.obar.backgroundPalette();assert.equal(f.writes.length,mark);
});
await test('synchronous import during first publication stops subsequent writes',async()=>{
    const f=fixture();f.obar.getPaletteFromImage=()=>[[[200,30,40]],[9]];
    let mark;
    f.settings.after=k=>{if(k==='dark-palette1'&&mark===undefined){f.settings.set_boolean('import-export',true);mark=f.writes.length;}};
    await f.obar.backgroundPalette();assert.equal(f.writes.length,mark,'publication continued after synchronous import callback');
});
await test('external palette replacement cancels decode without import flag',async()=>{
    const f=fixture();let resolve;f.obar.getPaletteFromImage=()=>new Promise(r=>resolve=r);
    const pending=f.obar.backgroundPalette();f.settings.set_strv('dark-palette1',['11','22','33']);
    const mark=f.writes.length;resolve([[[200,30,40]],[9]]);await pending;assert.equal(f.writes.length,mark);
});
await test('imported populations replace cache for auto-theme and mode changes',()=>{
    const f=fixture();f.obar._paletteCounts={dark:[100,...Array(11).fill(0)],light:Array(12).fill(5)};
    f.settings.set_boolean('import-export',true);f.settings.set_int('count12',100);f.settings.set_int('count1',0);
    f.settings.set_boolean('import-export',false);
    assert.equal(f.obar._paletteCounts?.dark,undefined,'imported counts left stale dark cache');
    AutoThemes.autoApplyBGPalette(f.obar,'dark');AutoThemes.onModeChange(f.obar);
    assert.equal(f.values.get('count1'),0);assert.equal(f.values.get('count12'),100);
});
await test('mode palette replacement invalidates only its own population cache',()=>{
    const f=fixture();f.obar._paletteCounts={dark:Array(12).fill(7),light:Array(12).fill(5)};
    f.settings.set_strv('dark-palette1',['11','22','33']);
    assert.equal(f.obar._paletteCounts?.dark,undefined);assert.equal(f.obar._paletteCounts.light[0],5);
});
await test('export pause without actual palette changes retains populations',()=>{
    const f=fixture();const counts={dark:Array(12).fill(7),light:Array(12).fill(5)};f.obar._paletteCounts=counts;
    f.settings.set_boolean('import-export',true);f.settings.set_strv('dark-palette1',f.values.get('dark-palette1'));f.settings.set_boolean('import-export',false);
    assert.equal(f.obar._paletteCounts,counts);
});
await test('controlled publication and mode copy keep both caches',async()=>{
    const f=fixture();f.values.set('light-bguri','file:///light.png');
    f.obar.getPaletteFromImage=uri=>[[[200,30,40]],[uri.includes('dark')?9:4]];
    await f.obar.backgroundPalette();AutoThemes.onModeChange(f.obar);
    assert.equal(f.obar._paletteCounts.dark[0],9);assert.equal(f.obar._paletteCounts.light[0],4);
});
await test('import palette change invalidates cached modes even with unchanged shared counts',()=>{
    const f=fixture();f.obar._paletteCounts={dark:[100,...Array(11).fill(0)],light:Array(12).fill(5)};
    f.values.set('count12',100);
    f.settings.set_boolean('import-export',true);f.settings.set_strv('light-palette1',['11','22','33']);
    f.settings.set_boolean('import-export',false);AutoThemes.onModeChange(f.obar);
    assert.equal(f.values.get('count1'),0);assert.equal(f.values.get('count12'),100);
});
await test('real mode copy preserves both populations and ongoing decode',async()=>{
    const f=fixture();f.values.set('light-bguri','file:///light.png');
    f.obar.getPaletteFromImage=uri=>[[[200,30,40]],[uri.includes('dark')?9:4]];
    await f.obar.backgroundPalette();
    let resolve;f.obar.getPaletteFromImage=()=>new Promise(r=>resolve=r);
    const pending=f.obar.backgroundPalette(), cancel=f.obar._paletteCancellable;
    f.values.set('color-scheme','default');AutoThemes.onModeChange(f.obar);
    assert.equal(cancel.is_cancelled(),false,'controlled mode copy cancelled pending native generation');
    assert.equal(f.obar._paletteCounts.light[0],4);assert.equal(f.obar._paletteCounts.dark[0],9);
    f.obar.cancelBackgroundPalette();resolve([null,null]);await pending;
});
await test('synchronous import at final mode count suppresses bg-change publication',async()=>{
    const f=fixture();f.obar._paletteCounts={dark:Array(12).fill(7)};
    let mark;
    f.settings.after=k=>{if(k==='count12'){f.settings.set_boolean('import-export',true);mark=f.writes.length;}};
    AutoThemes.onModeChange(f.obar);
    assert.equal(f.writes.slice(mark).filter(([k])=>k==='bg-change').length,0);
});
console.log(`palette-import: ${passed} passed, ${failed} failed`);if(failed)process.exitCode=1;
