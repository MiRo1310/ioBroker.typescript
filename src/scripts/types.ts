import type { TypeScript } from '../main';

export type StateChangeHandler = (id: string, state?: ioBroker.State | null) => void;

export type ReturnTypeInit = Promise<{ stateChangeHandler: StateChangeHandler }>;
// Bauplan für jedes Script-Modul unter src/scripts/*: init() bekommt den Adapter
// und liefert den Handler, der bei jedem stateChange dieses Moduls aufgerufen wird.
export interface ScriptModule {
    init(adapter: TypeScript): ReturnTypeInit;
}
