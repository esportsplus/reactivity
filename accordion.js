import * as reactivity_1ihsmodgjbfar0 from '@esportsplus/reactivity';
import { omit } from '@esportsplus/utilities';
import template from '../../components/template/index.js';
import './scss/index.scss';
class ReactiveObject_xy8kflxy8kfl2 extends reactivity_1ihsmodgjbfar0.ReactiveObject {
    #active = this[reactivity_1ihsmodgjbfar0.SIGNAL](0);
    constructor() {
        super(null);
    }
    get active() {
        return reactivity_1ihsmodgjbfar0.read(this.#active);
    }
    set active(_v0) {
        reactivity_1ihsmodgjbfar0.write(this.#active, _v0);
    }
}
const OMIT = ['state'];
let key = Symbol();
export default template.factory(function (attributes, content) {
    let ref, state = attributes.state || reactivity_1ihsmodgjbfar0.reactive({
        active: 0
    }), n, html;
    `
            <div
                ${omit(attributes, OMIT)}
                ${{
        class: () => {
            return state.active && '--active';
        },
        onrender: (element) => {
            (ref = element)[key] = state;
        },
        style: () => {
            let parent = ref.closest('accordion');
            if (parent && key in parent) {
                parent[key].active = (+parent[key].active) + 1;
            }
            return state.active && `--max-height: ${ref.scrollHeight}`;
        }
    }}
            >
                ${content}
            </div>
        `;
});
