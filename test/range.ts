import { reactive, root } from '@esportsplus/reactivity';
// import { html, type Attributes } from '@esportsplus/template';
// import form from '~/components/form';
import './scss/index.scss';


export default function(
    this: { attributes?: Record<PropertyKey, unknown> } | any,
    attributes: Record<PropertyKey, unknown> & { max: number, min: number, state?: { active: boolean, error: string, value: number } }
) {
    let { max, min } = attributes,
        state = attributes.state || reactive({
            active: false,
            error: '',
            value: 0
        });

    if (attributes?.value) {
        state.value = Number( attributes.value );
    }

    // @ts-ignore
    return html`
        <input
            class='range --border-state --border-black'
            style='${() => `--thumb-position: ${((state.value - min) / (max - min)) * 100}%`}'
            type='range'
            ${this?.attributes}
            ${attributes}
            ${{
                class: () => state.active && '--active',
                onfocusin: () => {
                    state.active = true;
                },
                onfocusout: () => {
                    state.active = false;
                },
                oninput: (e: any) => {
                    state.value = Number((e.target as HTMLInputElement).value);
                },
                value: root(() => (attributes?.value as number) || state.value || 0)
            }}
        />
    `;
};