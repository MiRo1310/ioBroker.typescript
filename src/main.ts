/*
 * Created with @iobroker/create-adapter v2.6.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an
import { Store } from './lib/store';
import * as utils from '@iobroker/adapter-core';
import { isDefined } from './lib/utils';
import type { Logger } from './lib/loggingController';
import { Global } from './lib/globalMethods';
import { init } from './scripts';

export class TypeScript extends utils.Adapter {
    private static instance: TypeScript;
    public store!: Store;
    public logger!: Logger;
    public toTelegramm!: (user: 'Michael', value: string, keyboard: []) => void;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'typescript',
        });
        this.on('ready', this.onReady.bind(this));
        TypeScript.instance = this;
    }

    public static getInstance(): TypeScript {
        return TypeScript.instance;
    }

    private async onReady(): Promise<void> {
        await this.setState('info.connection', false, true);
        if (!isDefined(this.instance)) {
            this.log.error('No instance found.');
            return;
        }
        const { stateChangeHandler } = await init(this);
        // const {  } = this.config;

        this.store = new Store(this);
        const global = new Global(this);
        this.logger = global.logger;
        this.toTelegramm = global.toTelegram.bind(this);

        try {
            this.on('stateChange', (id, state): void => {
                stateChangeHandler(id, state);
            });
        } catch (error) {
            this.logger.errorHandler(`Error in onReady`, error);
            await this.setState('info.connection', false, true);
        }
        await this.setState('info.connection', true, true);
    }
}
let adapter;

if (require.main !== module) {
    // Export the constructor in compact mode
    adapter = (options: Partial<utils.AdapterOptions> | undefined): TypeScript => new TypeScript(options);
} else {
    // otherwise start the instance directly
    (() => new TypeScript())();
}
export { adapter };
