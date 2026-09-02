// Usage: node storage/micro.mjs <build-dir> [iterations]
// Plain-node timing of the creation and deep-chain paths, independent of the vitest harness.
import { pathToFileURL } from 'node:url';

let dir = process.argv[2],
    n = Number(process.argv[3] ?? 300000),
    { computed, effect, read, signal, write } = await import(pathToFileURL(`${dir}/system.js`).href);

async function chain() {
    let s = signal(0),
        nodes = [],
        i = 0;

    nodes[0] = computed(() => read(s) + 1);

    for (let j = 1; j < 10; j++) {
        let prev = nodes[j - 1];

        nodes[j] = computed(() => read(prev) + 1);
    }

    effect(() => {
        read(nodes[9]);
    });

    let t = performance.now();

    for (let k = 0; k < n / 10; k++) {
        write(s, ++i);
        await Promise.resolve();
    }

    return performance.now() - t;
}

function create() {
    let t = performance.now();

    for (let k = 0; k < n; k++) {
        let s = signal(0);

        computed(() => read(s));
    }

    return performance.now() - t;
}

// Mirrors the vitest deep-chain bench: build a 10-deep chain plus effect per iteration, then write.
async function createChain() {
    let t = performance.now();

    for (let k = 0; k < n / 10; k++) {
        let s = signal(0),
            nodes = [];

        nodes[0] = computed(() => read(s) + 1);

        for (let j = 1; j < 10; j++) {
            let prev = nodes[j - 1];

            nodes[j] = computed(() => read(prev) + 1);
        }

        effect(() => {
            read(nodes[9]);
        });

        write(s, 1);
        await Promise.resolve();
    }

    return performance.now() - t;
}

for (let round = 0; round < 5; round++) {
    let c = create(),
        d = await chain(),
        e = await createChain();

    await new Promise(r => setTimeout(r, 20));
    console.log(`${dir}\tcreate ${(c / n * 1e6).toFixed(1)} ns/op\tchain ${(d / (n / 10) * 1e6).toFixed(0)} ns/write\tcreate+write chain ${(e / (n / 10) * 1e6).toFixed(0)} ns/iter`);
}
