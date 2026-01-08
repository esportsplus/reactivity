import { uid } from '@esportsplus/typescript/compiler';


const ENTRYPOINT = 'reactive';

const ENTRYPOINT_REGEX = /\breactive\b/;

const NAMESPACE = uid('reactivity');


const enum TYPES {
    Array,
    Computed,
    Object,
    Signal
}


export { ENTRYPOINT, ENTRYPOINT_REGEX, NAMESPACE, TYPES };
export { PACKAGE } from '../constants';