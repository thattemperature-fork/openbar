import assert from 'node:assert/strict';
import {fixture} from './runtime-harness.mjs';
export function geometryFixture() {
    const f = fixture(), {ext,Main} = f;
    Object.assign(ext._settings.values, {position:'Bottom',bartype:'Floating',height:35,bwidth:2,margin:10,
        'set-bottom-margin':true,'bottom-margin':30,'cust-margin-wmax':true,'margin-wmax':1});
    Main.layoutManager.monitors = [{x:0,y:0,width:1024,height:768}];
    ext._settings.set_double = (key,value) => {ext._settings.values[key]=value;};
    ext._updateAppearance = () => {};
    ext.setPanelStyle = () => {};
    return f;
}
const {ext,Main} = geometryFixture();
ext.setPanelBoxPosWindowMax(true, 'size-changed');
ext.setPanelBoxPosWindowMax(false, 'size-changed');
assert.equal(Main.layoutManager.panelBox.height, 79, 'normal return restores independent window gap');
assert.equal(Main.layoutManager.panelBox.y, 689);
console.log('round2 geometry normal return: PASS');
// A settings event must use the active policy, not ordinary margins.
ext.setPanelBoxPosWindowMax(true, 'size-changed');
ext._settings.values.height = 40;
ext.updatePanelStyle(null, 'height');
assert.equal(Main.layoutManager.panelBox.height, 46, 'height event preserves WMax margins');
// Repeat the same state after changing settings without a notification.
ext._settings.values.bwidth = 3;
ext.setPanelBoxPosWindowMax(true, 'size-changed');
assert.equal(Main.layoutManager.panelBox.height, 48, 'same-state refresh reads current geometry');
ext._settings.values.position = 'Top';
ext.setPanelBoxPosWindowMax(false, 'size-changed');
assert.equal(ext.wmax, false, 'top transition refreshes logical WMax cache');
assert.equal(ext.position, 'Top');
console.log('round2 geometry live settings/cache: PASS');
// Explicit fixture measurements, not a reimplementation of placement math.
const heights = {
    Floating: {normal:[59,79], wmax:[59,41]},
    Mainland: {normal:[39,69], wmax:[39,39]},
    Islands: {normal:[55,75], wmax:[55,37]},
    Trilands: {normal:[55,75], wmax:[55,37]},
};
let cases = 0;
for (const bartype of Object.keys(heights)) for (const position of ['Top','Bottom'])
for (const gap of [false,true]) for (const custom of [false,true]) for (const scale of [1,2]) {
    const f = geometryFixture(), e = f.ext, box = f.Main.layoutManager.panelBox;
    Object.assign(e._settings.values, {bartype,position,'set-bottom-margin':gap,'cust-margin-wmax':custom});
    e.themeContext.scale_factor = scale;
    for (const wmax of [false,true,true,false,false]) {
        e.setPanelBoxPosWindowMax(wmax, 'size-changed');
        const expected = heights[bartype][wmax?'wmax':'normal'][Number(wmax?custom:gap)] * scale;
        assert.equal(box.height, position === 'Top' ? -1 : expected, JSON.stringify({bartype,position,gap,custom,scale,wmax}));
        assert.equal(box.y, position === 'Top' ? 0 : 768 - expected);
        assert.equal(e.wmax, wmax); assert.equal(e.position, position);
    }
    // Independent current-source oracle: notification path must equal freshly
    // evaluated helper policy, even after consecutive settings or scale changes.
    for (const [key,value] of [['height',42],['bwidth',3],['margin',12],['bottom-margin',27],
        ['set-bottom-margin',!gap],['cust-margin-wmax',!custom],['margin-wmax',4],
        ['position',position === 'Top'?'Bottom':'Top'],['bartype','Floating']]) {
        e.setPanelBoxPosWindowMax(true,'size-changed');
        e._settings.values[key] = value;
        e.updatePanelStyle(null,key);
        const actual = [box.x,box.y,box.width,box.height];
        e.setPanelBoxPosWindowMax(true,'size-changed');
        assert.deepEqual(actual,[box.x,box.y,box.width,box.height],`event ${key} must preserve active geometry`);
        assert.equal(e.wmax,true);
    }
    const monitors = f.Main.layoutManager.monitors;
    f.Main.layoutManager.monitors = [];
    e.setPanelBoxPosWindowMax(false,'size-changed');
    assert.equal(e.wmax,false,'no monitors still updates policy state');
    f.Main.layoutManager.monitors = monitors;
    e.setPanelBoxPosWindowMax(false,'size-changed');
    e.themeContext.scale_factor = scale === 1?2:1;
    e.setPanelBoxPosWindowMax(false,'size-changed');
    assert(Number.isFinite(box.y));
    cases++;
}
// Same-state monitor relocation must not retain the old coordinate.
{
    const f = geometryFixture();
    f.ext._settings.values.position = 'Top';
    f.ext.setPanelBoxPosWindowMax(true);
    f.Main.layoutManager.monitors[0].y = -768;
    f.ext.setPanelBoxPosWindowMax(true);
    assert.equal(f.Main.layoutManager.panelBox.y,-768);
}
// Actual window-list policy entry point; host windows only are substituted.
{
    const f = geometryFixture(), e = f.ext;
    let windows = [];
    const pseudos = new Set();
    Object.assign(f.Main.panel, {has_style_pseudo_class:k=>pseudos.has(k),add_style_pseudo_class:k=>pseudos.add(k),remove_style_pseudo_class:k=>pseudos.delete(k)});
    f.context.global = {workspace_manager:{get_active_workspace:()=>({list_windows:()=>windows})}};
    f.context.Meta.WindowType = {DESKTOP:1};
    e._settings.values.wmaxbar = true;
    e.setWindowMaxBar(null,'size-changed');
    assert.equal(e.wmax,false);
    windows = [{get_monitor:()=>0,showing_on_its_workspace:()=>true,is_hidden:()=>false,get_window_type:()=>0,get_gtk_application_id:()=>'',maximized_horizontally:true,fullscreen:false}];
    e.setWindowMaxBar(null,'size-changed');
    assert.equal(e.wmax,true); assert(pseudos.has('windowmax'));
    windows = [];
    e.setWindowMaxBar(null,'size-changed');
    assert.equal(e.wmax,false); assert.equal(f.Main.layoutManager.panelBox.height,79);
}
console.log(`round2 geometry matrix: PASS (${cases} combinations plus transitions)`);
