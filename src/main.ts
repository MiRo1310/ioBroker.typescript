/*
 * Created with @iobroker/create-adapter v2.6.3
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an
import { Store } from './lib/store';
import * as utils from '@iobroker/adapter-core';
import { isDefined } from './lib/utils';

export class TypeScript extends utils.Adapter {
    private static instance: TypeScript;
    private store!: Store;

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'typescipt',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('unload', this.onUnload.bind(this));
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
        // const {  } = this.config;

        this.store = new Store(this);

        try {
            this.on('stateChange', async (id, state) => {});
        } catch (error) {
            this.store.logger.errorHandler(`Error in onReady`, error);
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param callback Callback
     */
    private onUnload(callback: () => void): void {}
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
