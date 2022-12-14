import Reactive from '~/reactive';


export default <T>(value: () => T): void => {
    new Reactive(value, true);
};