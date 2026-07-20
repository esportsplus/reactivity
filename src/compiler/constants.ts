import { uid } from '@esportsplus/typescript/compiler';


const ENTRYPOINT = 'reactive';

const ENTRYPOINT_REGEX = /\breactive\b/;

const NAMESPACE = uid('reactivity');


const TYPES = {
    Array: 0,
    Computed: 1,
    Object: 2,
    Signal: 3
} as const;

type TYPES = typeof TYPES[keyof typeof TYPES];


export { ENTRYPOINT, ENTRYPOINT_REGEX, NAMESPACE, TYPES };
export { PACKAGE_NAME } from '../constants';