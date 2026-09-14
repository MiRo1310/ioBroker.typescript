import type { TypeScript } from '../main';
import type { ReturnTypeInit, ScriptModule, StateChangeHandler } from './types';
import wattPilot from './wattpilot/wattpilot';

const modules: ScriptModule[] = [wattPilot];

export async function init(adapter: TypeScript): ReturnTypeInit {
    const handlers = await Promise.all(modules.map(module => module.init(adapter)));

    const stateChangeHandler: StateChangeHandler = (id, state) => {
        handlers.forEach(({ stateChangeHandler: handler }) => handler(id, state));
    };

    return { stateChangeHandler };
}
