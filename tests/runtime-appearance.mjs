import assert from 'node:assert/strict';
import {fixture} from './runtime-harness.mjs';
function setup(yaru = false) {
    const f = fixture(); f.ext.gnomeVersion = 50;
    f.ext._intSettings.values = {'accent-color':'blue', 'gtk-theme':'OriginalGTK', 'icon-theme':'OriginalIcons'};
    f.ext._settings.values['set-yarutheme'] = yaru;
    f.ext.setPanelStyle = () => {};
    return f;
}
{
    const {ext} = setup(true), settings = ext._intSettings;
    ext.updatePanelStyle(null, 'mscolor');
    assert.equal(settings.get_string('accent-color'), 'red');
    assert.equal(settings.get_string('gtk-theme'), 'Yaru-red');
    ext.disable();
    assert.equal(settings.get_string('accent-color'), 'blue', 'disable restores original accent');
    assert.equal(settings.get_string('gtk-theme'), 'OriginalGTK', 'startup-enabled Yaru restores GTK');
    assert.equal(settings.get_string('icon-theme'), 'OriginalIcons');
}
{
    const {ext} = setup(true), settings = ext._intSettings;
    ext.updatePanelStyle(null, 'mscolor');
    settings.set_string('accent-color', 'green'); settings.set_string('gtk-theme', 'UserGTK');
    ext.disable();
    assert.equal(settings.get_string('accent-color'), 'green', 'user accent survives disable');
    assert.equal(settings.get_string('gtk-theme'), 'UserGTK', 'user GTK survives disable');
    assert.equal(settings.get_string('icon-theme'), 'OriginalIcons', 'icon restored independently');
}
{
    const {ext} = setup(true), settings = ext._intSettings;
    ext.updatePanelStyle(null, 'mscolor');
    settings.set_string('accent-color', 'green'); settings.set_string('icon-theme', 'UserIcons');
    ext.updatePanelStyle(null, 'mscolor');
    ext._settings.values['set-yarutheme'] = false;
    ext.updatePanelStyle(null, 'set-yarutheme');
    assert.equal(settings.get_string('gtk-theme'), 'OriginalGTK', 'feature off restores GTK');
    assert.equal(settings.get_string('icon-theme'), 'UserIcons', 'later write captures newer user baseline');
    ext.disable(); assert.equal(settings.get_string('accent-color'), 'green');
}
{
    const {ext} = setup(); const settings = ext._intSettings;
    // A user may change away and back to our last value: ownership remains lost.
    ext.updatePanelStyle(null, 'mscolor');
    settings.set_string('accent-color', 'green'); settings.set_string('accent-color', 'red');
    ext.disable(); assert.equal(settings.get_string('accent-color'), 'red');
    assert.equal(ext._appearance.size, 0);
}
{
    const {ext} = setup(); const settings = ext._intSettings;
    settings.values['accent-color'] = 'red';
    ext.updatePanelStyle(null, 'mscolor');
    assert.equal(ext._appearance.size, 0, 'no-op writes do not claim user settings');
    settings.set_string = () => false;
    ext._writeAppearance('accent-color', 'green');
    ext.disable(); assert.equal(settings.values['accent-color'], 'red', 'failed write preserves baseline');
}
console.log('runtime appearance regression: PASS');
