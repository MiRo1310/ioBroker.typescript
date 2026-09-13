"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var globalMethods_exports = {};
__export(globalMethods_exports, {
  Global: () => Global
});
module.exports = __toCommonJS(globalMethods_exports);
var import_loggingController = require("./loggingController");
class Global {
  constructor(adapter) {
    this.adapter = adapter;
    this.logger = new import_loggingController.Logger(this.adapter);
  }
  logger;
  toTelegram(user, value, keyboard = []) {
    if (keyboard.length == 0) {
      this.adapter.sendTo("telegram.0", "send", {
        text: value,
        user
      });
    } else {
      this.adapter.sendTo("telegram.0", "send", {
        text: value,
        reply_markup: {
          keyboard,
          resize_keyboard: true,
          one_time_keyboard: true,
          user
        }
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Global
});
//# sourceMappingURL=globalMethods.js.map
