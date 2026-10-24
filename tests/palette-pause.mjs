import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root = new URL('../openbar@neuromorph/', import.meta.url);
const moduleURL = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
const utils = moduleURL(await readFile(new URL('utils.js', root), 'utf8'));
const source = (await readFile(new URL('autothemes.js', root), 'utf8')).replace("'./utils.js'", JSON.stringify(utils));
const {autoApplyBGPalette, onModeChange} = await import(moduleURL(source));
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; } catch (e) { failed++; console.error(`FAIL ${name}: ${e.message}`); } }
export function fixture(dark = 'Dark', light = 'Light', paused = false) {
    const values = new Map(Object.entries({'autotheme-dark': dark, 'autotheme-light': light, 'pause-reload': paused, bartype: 'Mainland'}));
    for (let i = 1; i <= 12; i++) {
        values.set('count'+i, 13-i);
        for (const mode of ['dark', 'light']) values.set(`${mode}-palette${i}`, [String(i*18), String(240-i*12), String(30+i*15)]);
    }
    const writes = [];
    const settings = {
        get_boolean: k => values.get(k) ?? false,
        get_string: k => values.get(k) ?? '',
        get_int: k => values.get(k) ?? 0,
        get_strv: k => values.get(k) ?? ['0.2', '0.4', '0.6'],
    };
    for (const kind of ['boolean', 'string', 'int', 'strv', 'double']) settings['set_'+kind] = (k, v) => {
        if (settings.hook) settings.hook(k, v);
        values.set(k, v); writes.push([k, v]);
    };
    return {_settings: settings, _intSettings: {get_string: () => 'prefer-dark'}, values, writes};
}
for (const dark of ['Dark', 'Select Theme']) for (const light of ['Light', 'Select Theme']) for (const mode of ['dark', 'light']) for (const paused of [false, true]) {
    test(`${dark}/${light}/${mode}/paused=${paused}`, () => {
        const f = fixture(dark, light, paused);
        autoApplyBGPalette(f, mode);
        assert.equal(f.values.get('pause-reload'), paused, 'must preserve previous pause');
        const selected = (mode === 'dark' ? dark : light) !== 'Select Theme';
        assert.equal(f.writes.filter(([k]) => k === 'trigger-reload').length, selected && !paused ? 1 : 0);
    });
}
for (const fn of [autoApplyBGPalette, onModeChange]) for (const paused of [false, true]) {
    test(`${fn.name} restores after failure paused=${paused}`, () => {
        const f = fixture('Dark', 'Light', paused);
        f._settings.hook = k => { if (k.endsWith('boxcolor')) throw new Error('injected setting failure'); };
        assert.throws(() => fn(f, 'dark'), /injected setting failure/);
        assert.equal(f.values.get('pause-reload'), paused);
        f._settings.hook = null;
        fn(f, 'dark');
        assert.equal(f.values.get('pause-reload'), paused);
        assert.equal(f.writes.filter(([k]) => k === 'trigger-reload').length, paused ? 0 : 1, 'subsequent reload is possible');
    });
    test(`${fn.name} nested call respects outer pause paused=${paused}`, () => {
        const f = fixture('Dark', 'Light', paused);
        let nested = false;
        f._settings.hook = k => {
            if (!nested && k.endsWith('boxcolor')) {
                nested = true; onModeChange(f);
                assert.equal(f.values.get('pause-reload'), true, 'nested operation must not unpause outer writes');
            }
        };
        fn(f, 'dark');
        assert.ok(nested);
        assert.equal(f.values.get('pause-reload'), paused);
        assert.equal(f.writes.filter(([k]) => k === 'trigger-reload').length, paused ? 0 : 1);
    });
}
for (const invalid of [0, -1, NaN, Infinity]) test(`invalid palette count ${invalid}`, () => {
    const f = fixture();
    for (let i = 1; i <= 12; i++) f.values.set('count'+i, invalid);
    autoApplyBGPalette(f, 'dark');
    assert.deepEqual(f.writes, [], 'invalid totals must not mutate theme or pause');
});
test('invalid mode is ignored', () => { const f = fixture(); autoApplyBGPalette(f, 'invalid'); assert.deepEqual(f.writes, []); });
test('import/export is ignored', () => { const f = fixture(); f.values.set('import-export', true); autoApplyBGPalette(f, 'dark'); onModeChange(f); assert.deepEqual(f.writes, []); });
console.log(`palette-pause: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
