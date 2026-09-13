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
var enum_exports = {};
__export(enum_exports, {
  ChargingStatusEnum: () => ChargingStatusEnum
});
module.exports = __toCommonJS(enum_exports);
var ChargingStatusEnum = /* @__PURE__ */ ((ChargingStatusEnum2) => {
  ChargingStatusEnum2["1P6A"] = "1 Phase 6a";
  ChargingStatusEnum2["1P7A"] = "1 Phase 7a";
  ChargingStatusEnum2["1P8A"] = "1 Phase 8a";
  ChargingStatusEnum2["1P9A"] = "1 Phase 9a";
  ChargingStatusEnum2["1P10A"] = "1 Phase 10a";
  ChargingStatusEnum2["1P11A"] = "1 Phase 11a";
  ChargingStatusEnum2["1P12A"] = "1 Phase 12a";
  ChargingStatusEnum2["1P13A"] = "1 Phase 13a";
  ChargingStatusEnum2["1P14A"] = "1 Phase 14a";
  ChargingStatusEnum2["1P15A"] = "1 Phase 15a";
  ChargingStatusEnum2["1P16A"] = "1 Phase 16a";
  ChargingStatusEnum2["3P6A"] = "3 Phasen 6a";
  ChargingStatusEnum2["3P7A"] = "3 Phasen 7a";
  ChargingStatusEnum2["3P8A"] = "3 Phasen 8a";
  ChargingStatusEnum2["3P9A"] = "3 Phasen 9a";
  ChargingStatusEnum2["3P10A"] = "3 Phasen 10a";
  ChargingStatusEnum2["3P11A"] = "3 Phasen 11a";
  ChargingStatusEnum2["3P12A"] = "3 Phasen 12a";
  ChargingStatusEnum2["3P13A"] = "3 Phasen 13a";
  ChargingStatusEnum2["3P14A"] = "3 Phasen 14a";
  ChargingStatusEnum2["3P15A"] = "3 Phasen 15a";
  ChargingStatusEnum2["3P16A"] = "3 Phasen 16a";
  ChargingStatusEnum2["AUTO"] = "auto";
  ChargingStatusEnum2["DISABLED"] = "disabled";
  return ChargingStatusEnum2;
})(ChargingStatusEnum || {});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ChargingStatusEnum
});
//# sourceMappingURL=enum.js.map
