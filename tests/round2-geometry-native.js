// Actual source + native theme list, in a disposable headless compositor only.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import GdkPixbuf from 'gi://GdkPixbuf';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
const dir=GLib.getenv('OPENBAR_TEST_DIR');
let count=0;
function assert(ok,msg) { if(!ok) throw Error(msg); count++; print(`PASS ${msg}`); }
export async function run() { await new Promise(()=>{}); }
export function init() {
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE,()=>{
        test().then(()=>GLib.file_set_contents(`${dir}/result`,`PASS Shell ${Config.PACKAGE_VERSION}: round2 geometry/fullscreen: ${count} assertions\n`))
            .catch(e=>logError(e,'round2 geometry/fullscreen regression failed')).finally(()=>global.context.terminate());
        return GLib.SOURCE_REMOVE;
    });
}
async function test() {
    await Scripting.sleep(1000);
    const path=`${dir}/openbar@neuromorph`;
    const {default:Openbar}=await import(`file://${path}/extension.js`);
    const [,bytes]=GLib.file_get_contents(`${path}/metadata.json`);
    const o=new Openbar({...JSON.parse(new TextDecoder().decode(bytes)),path,dir:Gio.File.new_for_path(path)});
    o._settings=o.getSettings();o._intSettings=new Gio.Settings({schema_id:'org.gnome.desktop.interface'});
    o._hcSettings=new Gio.Settings({schema_id:'org.gnome.desktop.a11y.interface'});
    o.gnomeVersion=Number(Config.PACKAGE_VERSION.split('.')[0]);o.addedSignal='child-added';o.removedSignal='child-removed';
    o.themeContext=St.ThemeContext.get_for_stage(global.stage);o.obarRunDir=Gio.File.new_for_path(dir);o.main=Main;
    o.panelBoxes=[];
    const s=o._settings,LM=Main.layoutManager,box=LM.panelBox;
    const monitors=LM.monitors, old=[box.x,box.y,box.width,box.height];
    const css=o.obarRunDir.get_child('stylesheet.css');
    GLib.file_set_contents(css.get_path(),'#panel.openbar { color: rgb(30,60,90); }');
    const loaded=()=>o.themeContext.get_theme().get_custom_stylesheets().some(f=>f.equal(css));
    let callback;
    const queue=o._queueTimeout;
    // Scheduler seam only: run actual callback synchronously while monitor
    // substitutions are active; never yield a fake monitor list to Shell.
    o._queueTimeout=(_name,fn)=>{callback=fn;};
    try {
        LM.monitors=[{x:0,y:0,width:1024,height:768,inFullscreen:false}];box.set_position(0,0);
        const scale=o.themeContext.scale_factor;
        const expectedHeights={Floating:{normal:[59,79],wmax:[59,41]},Mainland:{normal:[39,69],wmax:[39,39]},Islands:{normal:[55,75],wmax:[55,37]},Trilands:{normal:[55,75],wmax:[55,37]}};
        let combinations=0;
        try {
            for(const bartype of Object.keys(expectedHeights)) for(const position of ['Top','Bottom'])
            for(const gap of [false,true]) for(const custom of [false,true]) for(const factor of [1,2]) {
                s.set_string('bartype',bartype);s.set_string('position',position);
                s.set_double('height',35);s.set_double('bwidth',2);s.set_double('margin',10);
                s.set_boolean('set-bottom-margin',gap);s.set_double('bottom-margin',30);
                s.set_boolean('cust-margin-wmax',custom);s.set_double('margin-wmax',1);
                o.themeContext.scale_factor=factor;
                for(const wmax of [false,true,true,false,false]) {
                    o.setPanelBoxPosWindowMax(wmax,'size-changed');
                    const expected=expectedHeights[bartype][wmax?'wmax':'normal'][Number(wmax?custom:gap)]*factor;
                    assert(box.y===(position==='Top'?0:768-expected),`native geometry ${bartype}/${position}/gap${gap}/custom${custom}/scale${factor}/wmax${wmax}`);
                    if(position==='Bottom') assert(box.height===expected,'native bottom panelBox height');
                    assert(o.wmax===wmax&&o.position===position,'native geometry cache matches policy');
                }
                o.setPanelBoxPosWindowMax(true,'size-changed');
                s.set_double('height',40);o.updatePanelStyle(null,'height');
                const after=[box.y,box.height];o.setPanelBoxPosWindowMax(true,'size-changed');
                assert(after[0]===box.y&&after[1]===box.height,'native settings event equals active policy');
                combinations++;
            }
            LM.monitors=[];o.setPanelBoxPosWindowMax(false,'size-changed');
            assert(o.wmax===false,'native no-monitor policy state updates');
            LM.monitors=[{x:0,y:0,width:1024,height:768,inFullscreen:false}];
            o.setPanelBoxPosWindowMax(false,'size-changed');
            assert(Number.isFinite(box.y),'native same-state monitor return places panel');
            assert(combinations===64,'native geometry matrix completes 64 combinations');
        } finally {o.themeContext.scale_factor=scale;}
        s.set_string('position','Top');o.setPanelBoxPosWindowMax(false);
        s.set_boolean('set-fullscreen',false);s.set_boolean('set-overview',false);
        o.loadStylesheet();assert(loaded(),'normal load appears in native theme list');
        LM.monitors[0].inFullscreen=true;
        o.onFullScreen(null,'in-fullscreen-changed');callback();
        assert(!loaded()&&o.isObarReset,'fullscreen opt-out unloads and marks reset');
        o.updatePanelStyle(null,'reloadstyle');
        assert(!loaded()&&o.isObarReset,'ordinary reload cannot bypass fullscreen opt-out');
        s.set_boolean('set-overview',true);
        o.updatePanelStyle(null,'showing');
        assert(!loaded()&&o.isObarReset,'Overview attempt cannot clear blocked reset flag');
        LM.monitors[0].inFullscreen=false;
        o.onFullScreen(null,'in-fullscreen-changed');callback();
        assert(loaded()&&!o.isObarReset,'fullscreen exit restores stylesheet and reset flag');
        LM.monitors[0].inFullscreen=true;
        o.onFullScreen(null,'in-fullscreen-changed');callback();
        s.set_boolean('set-fullscreen',true);
        o.onFullScreen(null,'policy-changed');
        callback();
        assert(loaded()&&!o.isObarReset,'direct opt-in reconciliation restores reset stylesheet');
        s.set_boolean('set-fullscreen',false);
        o.onFullScreen(null,'policy-changed');callback();
        o.disabling=true;
        LM.monitors[0].inFullscreen=false;
        o.loadStylesheet();o.reloadStylesheet();
        assert(!loaded(),'direct load/reload while disabling cannot restore stylesheet');
        o.disabling=false;
        o.onFullScreen(null,'return');callback();
        assert(loaded()&&!o.isObarReset,'normal return after blocked load restores flags');
        // Fullscreen elsewhere must not affect the panel monitor.
        LM.monitors.push({x:1024,y:0,width:1024,height:768,inFullscreen:true});
        o.reloadStylesheet();assert(loaded(),'fullscreen on other monitor is not blocked');
        LM.monitors=[];o.reloadStylesheet();
        assert(loaded()&&!o.isObarReset,'no monitors is safe and clears stale reset on load');
    } finally {
        LM.monitors=monitors;box.set_position(old[0],old[1]);box.set_size(old[2],old[3]);
        o._queueTimeout=queue;o.unloadStylesheet();
    }
    // Full exported lifecycle and actual generator completion/notification path.
    // Only logical inFullscreen host metadata is changed; no physical/app fullscreen.
    Main.overview.hide();await Scripting.sleep(300);
    const wallpaper=GdkPixbuf.Pixbuf.new(GdkPixbuf.Colorspace.RGB,false,8,32,32);
    wallpaper.fill(0x5380b0ff);wallpaper.savev(`${dir}/wallpaper.png`,'png',[],[]);
    const bg=new Gio.Settings({schema_id:'org.gnome.desktop.background'});
    const uri=Gio.File.new_for_path(`${dir}/wallpaper.png`).get_uri();
    bg.set_string('picture-uri',uri);bg.set_string('picture-uri-dark',uri);
    const live=new Openbar({...JSON.parse(new TextDecoder().decode(bytes)),path,dir:Gio.File.new_for_path(path)});
    const config=live.getSettings();
    config.set_string('position','Top');config.set_boolean('set-fullscreen',false);
    config.set_boolean('fitts-widgets',false);config.set_boolean('set-yarutheme',false);
    const tracked=[];const runTask=live._runStyleTask;
    live._runStyleTask=function(...args) {const result=runTask.apply(this,args);tracked.push(result);return result;};
    async function settle() {while(tracked.length) await Promise.all(tracked.splice(0)); await Scripting.sleep(50); while(tracked.length) await Promise.all(tracked.splice(0));}
    const fullscreenDescriptors=monitors.map(m=>Object.getOwnPropertyDescriptor(m,'inFullscreen'));
    let logicalFullscreen=true;
    const liveLoaded=()=>live.themeContext.get_theme().get_custom_stylesheets().some(f=>f.equal(live.obarRunDir.get_child('stylesheet.css')));
    try {
        // Monitor.inFullscreen is a getter on modern Shell. Shadow only this
        // host property, retaining all native monitor identities and geometry.
        monitors.forEach(m=>Object.defineProperty(m,'inFullscreen',{get:()=>logicalFullscreen,configurable:true}));
        live.enable();await settle();
        assert(!liveLoaded()&&live.isObarReset,'exported enable generation respects fullscreen before delayed callback');
        config.set_double('height',40);
        config.set_boolean('reloadstyle',!config.get_boolean('reloadstyle'));
        assert(!liveLoaded()&&live.isObarReset,'native settings reload while fullscreen stays unloaded');
        live.updatePanelStyle(null,'trigger-reload');await settle();
        assert(!liveLoaded()&&live.isObarReset,'actual stylesheet generation stays unloaded');
        live._hcSettings.set_boolean('high-contrast',true);await Scripting.sleep(100);
        live.updatePanelStyle(null,'high-contrast',null,'high-contrast');await settle();
        assert(!liveLoaded()&&live.isObarReset,'actual high contrast generation stays unloaded');
        live._hcSettings.set_boolean('high-contrast',false);await Scripting.sleep(100);
        live.updatePanelStyle(null,'high-contrast',null,'high-contrast');await settle();
        assert(!liveLoaded()&&live.isObarReset,'normal contrast regeneration stays unloaded');
        config.set_boolean('set-fullscreen',true);
        assert(liveLoaded()&&!live.isObarReset,'settings opt-in restores native stylesheet and flags');
        config.set_boolean('set-fullscreen',false);
        live.reloadStylesheet();
        assert(!liveLoaded()&&live.isObarReset,'same-turn opt-out and reload uses live settings');
        // Kick a real queued writer then disable and re-enable in the same turn.
        live.updatePanelStyle(null,'trigger-reload');live.disable();live.enable();await settle();
        assert(!liveLoaded()&&live.isObarReset,'same-turn disable-enable cannot reload while fullscreen');
        logicalFullscreen=false;
        live.onFullScreen(null,'logical-exit');await Scripting.sleep(50);
        assert(liveLoaded()&&!live.isObarReset,'logical fullscreen exit after rapid return restores flags');
        logicalFullscreen=true;live.reloadStylesheet();
        live.updatePanelStyle(null,'trigger-reload');live.disable();logicalFullscreen=false;live.enable();await settle();
        assert(liveLoaded()&&!live.isObarReset,'same-turn disable and normal enable restores current policy flags');
        // Regression for the typo: native generator consumes both valid alphas.
        config.set_double('mbgalpha',0.23);config.set_double('mbalpha',0.67);
        live.updatePanelStyle(null,'trigger-reload');await settle();
        const text=new TextDecoder().decode(GLib.file_get_contents(live.obarRunDir.get_child('stylesheet.css').get_path())[1]);
        assert(text.includes(',0.23)')&&text.includes(`,${config.get_double('mbalpha') * (live.colorScheme === 'prefer-dark'?1:0.6)})`),'real menu alpha settings still generate stylesheet declarations');
        live.updatePanelStyle(null,'trigger-reload');live.disable();
        await live._styleCleanup;await settle();
        assert(!liveLoaded(),'disable during generation remains unloaded after writer cleanup');
        live.loadStylesheet();assert(!liveLoaded(),'late direct load after disable stays blocked');
    } finally {
        monitors.forEach((m,i)=>{if(fullscreenDescriptors[i]) Object.defineProperty(m,'inFullscreen',fullscreenDescriptors[i]); else delete m.inFullscreen;});
        if(live._settings) live.disable();
        await live._styleCleanup;
    }
}
