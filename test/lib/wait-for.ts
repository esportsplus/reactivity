const tick = (times = 1): Promise<void> => {
    let p = Promise.resolve();

    for (let i = 0; i < times; i++) {
        p = p.then(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
    }

    return p;
};

const waitFor = (condition: () => boolean, description: string, timeoutMs = 1000): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
        let deadline = Date.now() + timeoutMs,
            timer = setInterval(() => {
                if (condition()) {
                    clearInterval(timer);
                    resolve();
                }
                else if (Date.now() >= deadline) {
                    clearInterval(timer);
                    reject(new Error('wait-for: timed out waiting for ' + description));
                }
            }, 10);
    });
};


export { tick, waitFor };
