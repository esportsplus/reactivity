const captureUncaught = async (fn: () => void): Promise<unknown[]> => {
    let captured: unknown[] = [],
        previous = process.listeners('uncaughtException');

    process.removeAllListeners('uncaughtException');
    process.on('uncaughtException', (e) => { captured.push(e); });

    try {
        fn();

        await Promise.resolve();
        await Promise.resolve();
    }
    finally {
        process.removeAllListeners('uncaughtException');

        for (let i = 0, n = previous.length; i < n; i++) {
            process.on('uncaughtException', previous[i]);
        }
    }

    return captured;
};


export { captureUncaught };
