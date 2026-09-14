import { Logger } from './loggingController';
import type { TypeScript } from '../main';

export class Global {
    public readonly logger: Logger;

    constructor(public readonly adapter: TypeScript) {
        this.logger = new Logger(this.adapter);
    }

    public toTelegram(user: 'Michael', value: string, keyboard = []): void {
        if (keyboard.length == 0) {
            this.adapter.sendTo('telegram.0', 'send', {
                text: value,
                user: user,
            });
        } else {
            this.adapter.sendTo('telegram.0', 'send', {
                text: value,
                reply_markup: {
                    keyboard: keyboard,
                    resize_keyboard: true,
                    one_time_keyboard: true,
                    user: user,
                },
            });
        }
    }

    // public async sendToAlexaDots(deviceName: 'washer' | 'tel' | 'bell', message: string): Promise<void> {
    //     const settingsId = '0_userdata.0.Alexa.Ausgaben_auf_Geräten';
    //     const res = await this.adapter.getStateAsync(settingsId);
    //     let obj = {};
    //     if (res && typeof res.val === 'string') {
    //         try {
    //             obj = JSON.parse(res.val);
    //         } catch (err) {
    //             console.error(err);
    //         }
    //     }
    //
    //     for (const key of Object.keys(obj)) {
    //         if (obj[key as keyof typeof obj][deviceName]) {
    //             await this.adapter.setState(obj[key].speak, `${obj[key][`${deviceName}Volume`]};${message}`);
    //         }
    //     }
    // }
}
