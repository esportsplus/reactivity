import Reactive from '~/reactive';


export default <T>(fn: () => T): void => {
    new Reactive(fn, true);
};