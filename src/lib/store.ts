import { Logger } from './loggingController';
import type { TypeScript } from '../main';

export class Store {
    public readonly logger: Logger;

    constructor(public readonly adapter: TypeScript) {
        this.logger = new Logger(this.adapter);
    }
}
