// Real updatePanelStyle dispatch: alpha keys affect CSS, not actor/layout work.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fixture} from './runtime-harness.mjs';
const schema = fs.readFileSync(new URL('../openbar@neuromorph/schemas/org.gnome.shell.extensions.openbar.gschema.xml', import.meta.url), 'utf8');
for (const key of ['mbgalpha', 'mbalpha']) {
    assert(schema.includes(`name="${key}"`), `${key} is a real schema key`);
    const {ext, Main} = fixture();
    Object.assign(ext._settings.values, {position:'Bottom', bartype:'Floating', height:30, margin:10});
    Main.layoutManager.monitors = [{x:0,y:0,width:1024,height:768}];
    let stylePasses = 0, placements = 0;
    ext._updateAppearance = () => {};
    ext.setPanelStyle = () => stylePasses++;
    const original = ext.setPanelBoxPosition;
    ext.setPanelBoxPosition = function(...args) { placements++; return original.apply(this,args); };
    ext.updatePanelStyle(null, key);
    assert.equal(stylePasses, 0, `${key} must not run unrelated panel actor styling`);
    assert.equal(placements, 0, `${key} must not run panel geometry`);
}
console.log('round2 menu alpha dispatch: PASS (2 schema keys)');
