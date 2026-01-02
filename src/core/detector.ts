const mightNeedTransform = (code: string): boolean => {
    return /import\s*\{[^}]*\breactive\b[^}]*\}\s*from\s*['"]@esportsplus\/reactivity/.test(code);
};


export { mightNeedTransform };
