class Disposable {
    dispose(): void {
        throw new Error('@esportsplus/reactivity: Disposable should not be instantiated directly.');
    }
}


export { Disposable };