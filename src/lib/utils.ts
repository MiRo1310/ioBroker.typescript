export const isDefined = <T>(value: T | undefined | null): value is T => value !== undefined && value !== null;

export const isStateValue = (state?: ioBroker.State | null): boolean => isDefined(state) && isDefined(state?.val);
