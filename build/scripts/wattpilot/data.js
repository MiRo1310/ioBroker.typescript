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
var data_exports = {};
__export(data_exports, {
  WPG_BATTERY_CONTRIBUTION_BANDS: () => WPG_BATTERY_CONTRIBUTION_BANDS,
  WPG_CHARGE_CURVE: () => WPG_CHARGE_CURVE
});
module.exports = __toCommonJS(data_exports);
const WPG_CHARGE_CURVE = [
  [1380, 6, true],
  // 1P  6A =  1.38 kW
  [1610, 7, true],
  [1840, 8, true],
  [2070, 9, true],
  [2300, 10, true],
  [2530, 11, true],
  [2760, 12, true],
  [2990, 13, true],
  [3220, 14, true],
  [3450, 15, true],
  [3680, 16, true],
  [4140, 6, false],
  // 3P  6A =  4.14 kW
  [4830, 7, false],
  [5520, 8, false],
  [6210, 9, false],
  [6900, 10, false],
  [7590, 11, false],
  [8280, 12, false],
  [8970, 13, false],
  [9660, 14, false],
  [10350, 15, false],
  [11040, 16, false]
];
const WPG_BATTERY_CONTRIBUTION_BANDS = [
  [0, 0],
  [500, 200],
  [1e3, 700],
  [1500, 1200],
  [2e3, 1700]
];
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  WPG_BATTERY_CONTRIBUTION_BANDS,
  WPG_CHARGE_CURVE
});
//# sourceMappingURL=data.js.map
