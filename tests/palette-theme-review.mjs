import {fixture} from './palette-pause.mjs';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const url = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const auto = await readFile(new URL('../openbar@neuromorph/autothemes.js', import.meta.url),'utf8');
const current = await readFile(new URL('../openbar@neuromorph/utils.js',import.meta.url),'utf8');
const old = execFileSync('git',['show','16fd4c6:openbar@neuromorph/utils.js'],{encoding:'utf8'});
const results = [];
for (const theme of ['Dark','Light','Color','Pastel']) {
    const pair=[];
    for (const utils of [old,current]) {
        const {autoApplyBGPalette} = await import(url(auto.replace("'./utils.js'", JSON.stringify(url(utils)))));
        const f=fixture(theme,theme); autoApplyBGPalette(f,'dark');
        pair.push(Object.fromEntries(['bgcolor','mbgcolor','smbgcolor','mscolor'].map(k=>[k,f.values.get(k)])));
    }
    results.push({theme,before:pair[0],after:pair[1]});
}
console.log(JSON.stringify(results,null,2));
