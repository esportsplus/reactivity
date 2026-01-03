import { mightNeedTransform as checkTransform } from '@esportsplus/typescript/transformer';


let regex = /import\s*\{[^}]*\breactive\b[^}]*\}\s*from\s*['"]@esportsplus\/reactivity/;


const mightNeedTransform = (code: string): boolean => {
    return checkTransform(code, { regex });
};


export { mightNeedTransform };
