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
var store_exports = {};
__export(store_exports, {
  Store: () => Store
});
module.exports = __toCommonJS(store_exports);
var import_loggingController = require("./loggingController");
class Store {
  constructor(adapter) {
    this.adapter = adapter;
    this.logger = new import_loggingController.Logger(this.adapter);
  }
  logger;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Store
});
//# sourceMappingURL=store.js.map
