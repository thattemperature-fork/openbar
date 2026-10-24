// Verify downloaded upstream tags, not a guessed positional DateMenu contract.
// OPENBAR_CONTRACT_DIR must contain <45.0..50.0>-{dateMenu,calendar,panelMenu}.js.
import fs from 'node:fs';
import assert from 'node:assert/strict';
const dir = process.env.OPENBAR_CONTRACT_DIR;
assert.ok(dir, 'set OPENBAR_CONTRACT_DIR to downloaded tagged GNOME sources');
for (const version of [45, 46, 47, 48, 49, 50]) {
    const get = file => fs.readFileSync(`${dir}/${version}.0-${file}.js`, 'utf8');
    const date = get('dateMenu'), calendar = get('calendar'), panel = get('panelMenu');
    for (const field of ['_messageList', '_calendar', '_date', '_displaysSection', '_eventsItem', '_clocksItem', '_weatherItem'])
        assert.match(date, new RegExp(`this\\.${field} = new `), `${version}: named DateMenu ${field}`);
    assert.match(date, /vbox\.(?:add_actor|add_child)\(this\._calendar\)/, `${version}: calendar column parent`);
    for (const field of ['_placeholder', '_scrollView', '_clearButton', version >= 48 ? '_messageView' : '_sectionList'])
        assert.match(calendar, new RegExp(`this\\.${field} = new `), `${version}: named CalendarMessageList ${field}`);
    for (const field of ['_dndButton', '_dndSwitch'])
        assert.equal(calendar.includes(`this.${field} = new `), version < 49, `${version}: DND boundary`);
    assert.match(panel, /Signals: \{'menu-set': \{\}\}/, `${version}: native signal`);
    const setMenu = panel.slice(panel.indexOf('    setMenu(menu)'));
    assert.ok(setMenu.indexOf('this.menu = menu') < setMenu.indexOf("this.emit('menu-set')"), `${version}: emitter.menu current before emit`);
    console.log(`PASS round2-menu-contracts GNOME ${version}.0`);
}
