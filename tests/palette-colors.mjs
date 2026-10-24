import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = await readFile(new URL('../openbar@neuromorph/utils.js', import.meta.url), 'utf8');
const U = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
let passed = 0, failed = 0;
function test(name, fn) { try { fn(); passed++; } catch(e) { failed++; console.error(`FAIL ${name}: ${e.message}`); } }
const near = (actual, expected, tolerance = 0.00005) => assert.ok(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance, `${actual} != ${expected} ± ${tolerance}`);
for (const rgb of [[0,0,0], [255,0,0], [0,255,0], [0,0,255], [255,0,255], [123,0,45]]) test(`HSP scalar/array ${rgb}`, () => near(U.getHSP(...rgb), U.getHSP(rgb)));
test('HSP red reference', () => near(U.getHSP(255,0,0), Math.sqrt(0.299)*255));
test('HSP compare red/blue', () => assert.equal(U.compareHSP([255,0,0], [0,0,255]), 1));
test('dark classification zero green', () => assert.equal(U.getBgDark(255,0,255), false));
// sRGB/D65, 2°: published primary values in the linked color-science discussion.
for (const [rgb, lab] of [
    [[0,0,0],[0,0,0]], [[255,255,255],[100,0,0]],
    [[255,0,0],[53.24079414,80.09245960,67.20319652]],
    [[0,255,0],[87.73471268,-86.18270839,83.17930383]],
    [[0,0,255],[32.29701093,79.18725441,-107.860155]],
]) test(`RGB→Lab ${rgb}`, () => U.rgbToLab(rgb).forEach((v,i) => near(v,lab[i],0.0003)));
if (!process.argv.includes('--hsp-only')) {
    const data = (await readFile(new URL('palette-ciede2000.txt', import.meta.url), 'utf8')).trim().split(/\n/).map(line => line.trim().split(/\s+/).map(Number));
    assert.equal(data.length, 34);
    for (const [i,row] of data.entries()) test(`Sharma reference ${i+1}`, () => {
        const a = row.slice(0,3), b = row.slice(3,6);
        assert.equal(typeof U.deltaE2000, 'function', 'need Lab entry point to validate the actual formula');
        near(U.deltaE2000(a,b), row[6]); near(U.deltaE2000(b,a), row[6]);
        near(U.deltaE2000(a,a),0,1e-12);
    });
    const colors = [[0,0,0],[255,255,255],[255,0,0],[0,255,0],[0,0,255],[32,73,108],[210,80,129]];
    for (const a of colors) for (const b of colors) test(`RGB distance identity/symmetry ${a}/${b}`, () => {
        near(U.colorDistance2000(a,a),0,1e-12);
        near(U.colorDistance2000(a,b),U.colorDistance2000(b,a),1e-12);
        near(U.colorDistance2000(a,b),U.deltaE2000(U.rgbToLab(a),U.rgbToLab(b)),1e-12);
    });
}
console.log(`palette-colors: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
