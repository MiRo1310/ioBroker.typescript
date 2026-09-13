import type { TypeScript } from '../main';

export class Logger {
    constructor(private readonly adapter: TypeScript) {}

    public error(msg: string): void {
        this.adapter.log.error(msg);
    }

    public debug(msg: string): void {
        this.adapter.log.debug(msg);
    }

    public warn(msg: string): void {
        this.adapter.log.warn(msg);
    }

    public info(msg: string): void {
        this.adapter.log.info(msg);
    }

    public errorHandler(title: string, e: any): void {
        this.adapter.log.error(title);

        this.error(`Error message: ${e.message}`);
        this.error(`Error stack: ${e.stack}`);

        if (e?.response) {
            this.error(`Server response: ${e?.response?.status}`);
            this.error(`Server status: ${e?.response?.statusText}`);
        }
    }
}
