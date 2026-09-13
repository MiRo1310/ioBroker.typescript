export function stateChanged(state?: ioBroker.State | null, oldValue?: string | number | boolean | null): boolean {
    return state?.val !== oldValue;
}
