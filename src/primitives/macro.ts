import { assign } from '~/context';
import { computed, read } from '~/core';
import { Options } from '~/types';


// export default macro(() => {
//     let validator = object({
//             alchemy: string().optional(),
//             etherscan: string().optional()
//         });

//     return (...args: Parameters<typeof validator['validate']>) => {
//         return validator.validate(...args);
//     };
// });


export default <T extends (...args: unknown[]) => unknown>(fn: () => T, options: Options = {}) => {
    let node = computed(fn, options);

    return assign(
        (...args: Parameters<ReturnType<typeof fn>>) => {
            return (read(node) as ReturnType<typeof fn>)(...args);
        },
        node
    );
};