// Usage: node storage/ab-compare.mjs <dir> <baseline-name> [filter-regex]
// Prints, per bench, the median hz of every side relative to the baseline side.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

let dir = process.argv[2] ?? 'storage/ab',
    base = process.argv[3] ?? 'control',
    filter = process.argv[4] ? new RegExp(process.argv[4]) : null,
    sides = {};

for (let file of readdirSync(dir)) {
    let m = /^(.+)-(\d+)\.json$/.exec(file);

    if (!m) {
        continue;
    }

    let json = JSON.parse(readFileSync(join(dir, file), 'utf8')),
        side = (sides[m[1]] ??= {});

    for (let f of json.files) {
        for (let g of f.groups) {
            for (let b of g.benchmarks) {
                (side[`${g.fullName.replace(/^.*> /, '')} > ${b.name}`] ??= []).push(b.hz);
            }
        }
    }
}

let median = (a) => {
        let s = [...a].sort((x, y) => x - y),
            n = s.length;

        return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
    },
    names = Object.keys(sides).filter(n => n !== base),
    summary = Object.fromEntries(names.map(n => [n, []])),
    rows = [];

for (let key of Object.keys(sides[base])) {
    if (filter && !filter.test(key)) {
        continue;
    }

    let b = median(sides[base][key]),
        cells = names.map(n => {
            let v = sides[n][key];

            if (!v) {
                return '      n/a';
            }

            let d = (median(v) / b - 1) * 100;

            summary[n].push(d);

            return `${d >= 0 ? '+' : ''}${d.toFixed(1).padStart(6)}%`;
        });

    rows.push([key, cells]);
}

console.log(`${''.padEnd(48)} ${names.map(n => n.padStart(9)).join(' ')}   (vs ${base}, rounds ${sides[base][Object.keys(sides[base])[0]].length})`);

for (let [key, cells] of rows) {
    console.log(`${key.slice(0, 48).padEnd(48)} ${cells.join(' ')}`);
}

console.log(`\n${'median'.padEnd(48)} ${names.map(n => `${median(summary[n]).toFixed(1).padStart(8)}%`).join(' ')}`);
