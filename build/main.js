"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var main_exports = {};
__export(main_exports, {
  TypeScript: () => TypeScript,
  adapter: () => adapter
});
module.exports = __toCommonJS(main_exports);
var import_store = require("./lib/store");
var utils = __toESM(require("@iobroker/adapter-core"));
var import_utils = require("./lib/utils");
var import_globalMethods = require("./lib/globalMethods");
var import_scripts = require("./scripts");
class TypeScript extends utils.Adapter {
  static instance;
  store;
  logger;
  toTelegramm;
  constructor(options = {}) {
    super({
      ...options,
      name: "typescript"
    });
    this.on("ready", this.onReady.bind(this));
    TypeScript.instance = this;
  }
  static getInstance() {
    return TypeScript.instance;
  }
  async onReady() {
    await this.setState("info.connection", false, true);
    if (!(0, import_utils.isDefined)(this.instance)) {
      this.log.error("No instance found.");
      return;
    }
    const { stateChangeHandler } = await (0, import_scripts.init)(this);
    this.store = new import_store.Store(this);
    const global = new import_globalMethods.Global(this);
    this.logger = global.logger;
    this.toTelegramm = global.toTelegram.bind(this);
    try {
      this.on("stateChange", (id, state) => {
        stateChangeHandler(id, state);
      });
    } catch (error) {
      this.logger.errorHandler(`Error in onReady`, error);
      await this.setState("info.connection", false, true);
    }
    await this.setState("info.connection", true, true);
  }
}
let adapter;
if (require.main !== module) {
  adapter = (options) => new TypeScript(options);
} else {
  (() => new TypeScript())();
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TypeScript,
  adapter
});
//# sourceMappingURL=main.js.map
