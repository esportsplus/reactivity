const { defineProperty } = Object;

const { isArray } = Array;

const isFunction = (value: unknown): value is Function => {
    return typeof value === 'function';
};

const isInstanceOf = <T>(instance: unknown, match: new (...args: any) => T): instance is T => {
    return typeof instance === 'object' && instance !== null && instance.constructor === match;
};

const isNumber = (value: any): value is number => {
    return !isNaN(value);
};

const isObject = (value: unknown): value is Record<PropertyKey, unknown> => {
    return typeof value === 'object' && value !== null && value.constructor === Object;
};

const isString = (value: unknown): value is string => {
    return typeof value === 'string';
};


export { defineProperty, isArray, isFunction, isInstanceOf, isNumber, isObject, isString };