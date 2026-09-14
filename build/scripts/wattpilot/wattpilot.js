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
var wattpilot_exports = {};
__export(wattpilot_exports, {
  default: () => wattpilot_default
});
module.exports = __toCommonJS(wattpilot_exports);
var import_enum = require("../../enum/enum");
var import_data = require("./data");
var import_utils = require("../../lib/utils");
var import_state = require("../../lib/state");
const WPG_FRONIUS_SET_STATE = "fronius-wattpilot.0.set_state";
const WPG_FRONIUS_SET_POWER = "fronius-wattpilot.0.set_power";
const WPG_ACTUAL_POWER_ID = "fronius-wattpilot.0.power";
const WPG_CAR_CONNECTED_ID = "fronius-wattpilot.0.carConnected";
const WPG_GRID_POWER_ID = "modbus.0.holdingRegisters.41079_grid_Power";
const WPG_BATTERY_POWER_ID = "modbus.0.holdingRegisters.41067_Active_Power";
const WPG_STATUS_STATE_ID = "0_userdata.0.Wattpilot.WattpilotScriptJson";
const WPG_CHARGING_MODE_ID = "0_userdata.0.Wattpilot.chargingMode";
const WPG_CHARGING_STATUS_ID = "0_userdata.0.Wattpilot.ChargingStatus";
const WPG_ENABLE_LOGGING_ID = "0_userdata.0.Wattpilot.enableLogging";
const WPG_GRID_DRAW_ALLOWANCE_ID = "0_userdata.0.Wattpilot.gridDrawAllowanceWatt";
const WPG_CONNECTED_STATUSES = ["Complete", "Charging"];
const WPG_ACTUAL_POWER_ON_THRESHOLD = 100;
const WPG_STATUS_WRITE_INTERVAL_MS = 1e4;
let wpgLastStatusWriteTime = 0;
const WPG_HYSTERESIS_W = 200;
const WPG_PHASE_SWITCH_UP_COOLDOWN_MS = 2 * 60 * 1e3;
const WPG_PHASE_SWITCH_DOWN_COOLDOWN_MS = 10 * 1e3;
const WPG_OFF_DELAY_MS = 10 * 1e3;
const WPG_START_HOLD_MS = 30 * 1e3;
const WPG_STEP_UP_LOCK_MS = 10 * 1e3;
const WPG_START_INDEX = 0;
async function init(adapter) {
  var _a, _b, _c;
  await adapter.subscribeForeignStatesAsync([
    WPG_ACTUAL_POWER_ID,
    WPG_CAR_CONNECTED_ID,
    WPG_GRID_POWER_ID,
    WPG_BATTERY_POWER_ID,
    WPG_STATUS_STATE_ID,
    WPG_CHARGING_MODE_ID,
    WPG_CHARGING_STATUS_ID,
    WPG_ENABLE_LOGGING_ID,
    WPG_GRID_DRAW_ALLOWANCE_ID
  ]);
  function wpgParseChargingStatus(val) {
    if (!val) {
      return;
    }
    try {
      return JSON.parse(val);
    } catch (e) {
      console.error("[Wattpilot] Error parsing WallboxChargingStatus: ", e);
    }
  }
  const WPG_LOWEST_THREE_PHASE_INDEX = import_data.WPG_CHARGE_CURVE.findIndex((level) => !level[2]);
  function wpgManualLevelIndexForMode(mode) {
    const index = Object.values(import_enum.ChargingStatusEnum).indexOf(mode);
    return index < import_data.WPG_CHARGE_CURVE.length ? index : -1;
  }
  function wpgBatteryContribution(batteryPower) {
    for (let i = import_data.WPG_BATTERY_CONTRIBUTION_BANDS.length - 1; i >= 0; i--) {
      if (batteryPower >= import_data.WPG_BATTERY_CONTRIBUTION_BANDS[i][0]) {
        return import_data.WPG_BATTERY_CONTRIBUTION_BANDS[i][1];
      }
    }
    return 0;
  }
  let wpgCurrentIndex = -1;
  let wpgCurrentPhase = null;
  let wpgLastPhaseSwitchTime = 0;
  let wpgOffTimer;
  let wpgIncreaseLockTimer;
  let wpgIncreaseLockedUntil = 0;
  let wpgRawGridPower = 0;
  let wpgGridPower = 0;
  let wpgBatteryPower = 0;
  let wpgCarConnected = false;
  let wpgChargingMode = import_enum.ChargingStatusEnum.DISABLED;
  let wpgActualPower = 0;
  let wpgChargingComplete = false;
  let wpgEnableLogging = true;
  let wpgGridDrawAllowanceWatt = 0;
  const wpgInitBattery = await adapter.getStateAsync(WPG_BATTERY_POWER_ID);
  if (wpgInitBattery) {
    wpgBatteryPower = wpgInitBattery.val;
  }
  const wpgInitCar = await adapter.getStateAsync(WPG_CAR_CONNECTED_ID);
  if (wpgInitCar) {
    wpgCarConnected = WPG_CONNECTED_STATUSES.includes(wpgInitCar.val);
  }
  const wpgInitChargingMode = await adapter.getStateAsync(WPG_CHARGING_MODE_ID);
  if (wpgInitChargingMode) {
    wpgChargingMode = wpgInitChargingMode.val;
  }
  const wpgInitEnableLogging = await adapter.getStateAsync(WPG_ENABLE_LOGGING_ID);
  if (wpgInitEnableLogging) {
    wpgEnableLogging = !!wpgInitEnableLogging.val;
  }
  const wpgInitGridDrawAllowance = await adapter.getStateAsync(WPG_GRID_DRAW_ALLOWANCE_ID);
  if (wpgInitGridDrawAllowance) {
    wpgGridDrawAllowanceWatt = (_a = wpgInitGridDrawAllowance.val) != null ? _a : 0;
  }
  const wpgInitChargingStatus = wpgParseChargingStatus(
    (_b = await adapter.getStateAsync(WPG_CHARGING_STATUS_ID)) == null ? void 0 : _b.val
  );
  if (wpgInitChargingStatus) {
    wpgChargingComplete = wpgInitChargingStatus.chargingComplete;
  }
  const wpgInitPower = await adapter.getStateAsync(WPG_ACTUAL_POWER_ID);
  if (wpgInitPower) {
    wpgActualPower = ((_c = wpgInitPower.val) != null ? _c : 0) * 1e3;
  }
  await wpgStopLoading();
  wpgLogging(`Script gestartet \u2014 Auto: ${wpgCarConnected} | Modus: ${wpgChargingMode} | Wallbox gestoppt (frc;1)`);
  function wpgLogging(msg, type = "log") {
    if (!wpgEnableLogging) {
      return;
    }
    console[type](`[Wattpilot] ${msg}`);
  }
  async function wpgAckState(id, val) {
    await adapter.setState(id, val, true);
  }
  function wpgComputeAvailableSurplus() {
    if (wpgBatteryPower < 0) {
      const result2 = wpgRawGridPower + wpgBatteryPower;
      wpgLogging(
        `\xDCberschuss: Grid ${wpgRawGridPower}W + Batterie (entl\xE4dt) ${wpgBatteryPower}W = ${result2}W`,
        "debug"
      );
      return result2;
    }
    const contribution = wpgBatteryContribution(wpgBatteryPower);
    const result = wpgRawGridPower + contribution;
    wpgLogging(
      `\xDCberschuss: Grid ${wpgRawGridPower}W + Batterie-Beitrag ${contribution}W (Batterie l\xE4dt ${wpgBatteryPower}W, Band) = ${result}W`,
      "debug"
    );
    return result;
  }
  function wpgLevelLabel(index) {
    if (index < 0) {
      return "off";
    }
    const [watt, ampere, sp] = import_data.WPG_CHARGE_CURVE[index];
    return `${sp ? "1P" : "3P"} ${ampere}A = ${(watt / 1e3).toFixed(2)} kW`;
  }
  function wpgCalculateIndex(surplus) {
    const chargingPower = wpgCurrentIndex >= 0 ? import_data.WPG_CHARGE_CURVE[wpgCurrentIndex][0] : 0;
    const available = surplus + chargingPower;
    let target = -1;
    for (let i = import_data.WPG_CHARGE_CURVE.length - 1; i >= 0; i--) {
      if (available >= import_data.WPG_CHARGE_CURVE[i][0]) {
        target = i;
        break;
      }
    }
    if (target === -1 && wpgGridDrawAllowanceWatt > 0 && available >= import_data.WPG_CHARGE_CURVE[0][0] - wpgGridDrawAllowanceWatt) {
      target = 0;
      wpgLogging(
        `Netzbezugs-Freigabe: halte ${wpgLevelLabel(0)} trotz Netzbezug (${available}W verf\xFCgbar, Freigabe ${wpgGridDrawAllowanceWatt}W)`
      );
    }
    if (wpgCurrentIndex >= 0 && target < wpgCurrentIndex) {
      const threshold = import_data.WPG_CHARGE_CURVE[wpgCurrentIndex][0];
      if (available >= threshold - WPG_HYSTERESIS_W) {
        wpgLogging(
          `Hysterese: bleibe bei ${wpgLevelLabel(wpgCurrentIndex)} (${available}W \u2265 ${threshold - WPG_HYSTERESIS_W}W)`
        );
        return wpgCurrentIndex;
      }
    }
    if (target >= 0 && wpgCurrentIndex >= 0 && import_data.WPG_CHARGE_CURVE[target][2] !== import_data.WPG_CHARGE_CURVE[wpgCurrentIndex][2]) {
      const switchingDown = import_data.WPG_CHARGE_CURVE[target][2];
      const cooldownMs = switchingDown ? WPG_PHASE_SWITCH_DOWN_COOLDOWN_MS : WPG_PHASE_SWITCH_UP_COOLDOWN_MS;
      const elapsed = Date.now() - wpgLastPhaseSwitchTime;
      if (elapsed < cooldownMs) {
        const remaining = Math.round((cooldownMs - elapsed) / 1e3);
        const sp = import_data.WPG_CHARGE_CURVE[wpgCurrentIndex][2];
        let best = -1;
        for (let i = import_data.WPG_CHARGE_CURVE.length - 1; i >= 0; i--) {
          if (import_data.WPG_CHARGE_CURVE[i][2] === sp && available >= import_data.WPG_CHARGE_CURVE[i][0]) {
            best = i;
            break;
          }
        }
        if (best >= 0) {
          wpgLogging(`Phasenwechsel-Cooldown (${remaining}s): bleibe bei ${sp ? "1P" : "3P"}, Index ${best}`);
          return best;
        }
        const lowest = import_data.WPG_CHARGE_CURVE.findIndex((level) => level[2] === sp);
        wpgLogging(
          `Phasenwechsel-Cooldown (${remaining}s): halte Mindeststufe ${wpgLevelLabel(lowest)} (Netzbezug m\xF6glich)`
        );
        return lowest;
      }
    }
    return target;
  }
  async function wpgWriteStatusForWattpilot(force = false) {
    const now = Date.now();
    if (!force && now - wpgLastStatusWriteTime < WPG_STATUS_WRITE_INTERVAL_MS) {
      return;
    }
    wpgLastStatusWriteTime = now;
    const charging = wpgCurrentIndex >= 0;
    const level = charging ? import_data.WPG_CHARGE_CURVE[wpgCurrentIndex] : null;
    const allowCharging = wpgChargingMode !== import_enum.ChargingStatusEnum.DISABLED;
    const autoCharging = wpgChargingMode === import_enum.ChargingStatusEnum.AUTO;
    const stopReasons = [];
    if (!wpgCarConnected) {
      stopReasons.push("Kein Auto angeschlossen");
    }
    if (!allowCharging) {
      stopReasons.push("Laden nicht freigegeben");
    }
    if (!autoCharging) {
      stopReasons.push("Automatikladen nicht aktiv");
    }
    if (wpgChargingComplete) {
      stopReasons.push("Ladung abgeschlossen");
    }
    if (wpgCarConnected && allowCharging && autoCharging && !wpgChargingComplete && !charging) {
      stopReasons.push("Kein ausreichender \xDCberschuss");
    }
    const actualGridDraw = wpgCurrentIndex === 0 ? Math.max(0, import_data.WPG_CHARGE_CURVE[0][0] - wpgGridPower) : 0;
    const gridDrawAllowanceUsedPercent = wpgGridDrawAllowanceWatt > 0 ? Math.min(100, Math.round(actualGridDraw / wpgGridDrawAllowanceWatt * 100)) : 0;
    const status = {
      charging,
      chargingComplete: wpgChargingComplete,
      stopReasons,
      carConnected: wpgCarConnected,
      allowCharging,
      autoCharging,
      currentIndex: wpgCurrentIndex,
      ampere: level ? level[1] : null,
      singlePhase: level ? level[2] : null,
      phases: level ? level[2] ? 1 : 3 : null,
      chargingPowerW: level ? level[0] : null,
      gridPower: wpgGridPower,
      batteryPower: wpgBatteryPower,
      gridDrawAllowanceUsedPercent,
      increaseLockActive: wpgIncreaseLocked(),
      increaseLockRemainingSeconds: Math.max(0, Math.round((wpgIncreaseLockedUntil - now) / 1e3)),
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await adapter.setStateChangedAsync(WPG_STATUS_STATE_ID, JSON.stringify(status), true);
  }
  function wpgCancelOffTimer() {
    if (wpgOffTimer !== null) {
      adapter.clearTimeout(wpgOffTimer);
      wpgOffTimer = null;
      wpgLogging(`Ausschaltverz\xF6gerung abgebrochen \u2014 \xDCberschuss wieder ausreichend`);
    }
  }
  function wpgScheduleOffTimer() {
    if (wpgOffTimer !== null) {
      return;
    }
    wpgLogging(`Bezug zu gering \u2014 Ausschaltverz\xF6gerung gestartet (${WPG_OFF_DELAY_MS / 1e3}s)`);
    wpgOffTimer = adapter.setTimeout(async () => {
      wpgOffTimer = null;
      wpgCurrentIndex = -1;
      wpgCurrentPhase = null;
      await wpgStopLoading();
      await wpgWriteStatusForWattpilot(true);
    }, WPG_OFF_DELAY_MS);
  }
  function wpgIncreaseLocked() {
    return Date.now() < wpgIncreaseLockedUntil;
  }
  function wpgLockIncreases(durationMs) {
    wpgIncreaseLockedUntil = Date.now() + durationMs;
    if (wpgIncreaseLockTimer !== null) {
      adapter.clearTimeout(wpgIncreaseLockTimer);
    }
    wpgIncreaseLockTimer = adapter.setTimeout(async () => {
      wpgIncreaseLockTimer = null;
      wpgLogging(`Hochschalt-Sperre beendet \u2014 normale Regelung aktiv`);
      await wpgEvaluateAndSwitch();
    }, durationMs);
  }
  function wpgCancelIncreaseLock() {
    if (wpgIncreaseLockTimer !== null) {
      adapter.clearTimeout(wpgIncreaseLockTimer);
      wpgIncreaseLockTimer = null;
    }
    wpgIncreaseLockedUntil = 0;
  }
  async function wpgApplyLevel(index, reason, lockMs) {
    const [, ampere, singlePhase] = import_data.WPG_CHARGE_CURVE[index];
    if (wpgCurrentPhase === null || wpgCurrentPhase !== singlePhase) {
      wpgLastPhaseSwitchTime = Date.now();
    }
    wpgCurrentIndex = index;
    wpgCurrentPhase = singlePhase;
    wpgLogging(
      lockMs > 0 ? `${reason}: ${wpgLevelLabel(index)} f\xFCr ${lockMs / 1e3}s Hochschalt-Sperre` : `${reason}: ${wpgLevelLabel(index)}`
    );
    await (singlePhase ? wpgSetOnePhaseLoading() : wpgSetThreePhaseLoading());
    await adapter.setStateChangedAsync(WPG_FRONIUS_SET_POWER, ampere, false);
    await wpgStartLoading();
    if (lockMs > 0) {
      wpgLockIncreases(lockMs);
    }
    await wpgWriteStatusForWattpilot(true);
  }
  async function wpgResync() {
    wpgCancelOffTimer();
    wpgCancelIncreaseLock();
    wpgCurrentIndex = -1;
    wpgCurrentPhase = null;
    await wpgStopLoading();
    await wpgWriteStatusForWattpilot(true);
    await wpgEvaluateAndSwitch();
  }
  async function wpgEvaluateAndSwitch() {
    wpgLogging(
      `Grid: ${wpgGridPower}W | Batterie: ${wpgBatteryPower}W | Auto: ${wpgCarConnected} | Modus: ${wpgChargingMode} | Stufe: ${wpgLevelLabel(wpgCurrentIndex)}`,
      "debug"
    );
    if (wpgChargingMode === import_enum.ChargingStatusEnum.DISABLED) {
      wpgCancelOffTimer();
      wpgCancelIncreaseLock();
      if (wpgCurrentIndex !== -1) {
        wpgCurrentIndex = -1;
        wpgCurrentPhase = null;
        await wpgStopLoading();
        await wpgWriteStatusForWattpilot(true);
      } else {
        await wpgWriteStatusForWattpilot();
      }
      return;
    }
    const manualIndex = wpgManualLevelIndexForMode(wpgChargingMode);
    if (manualIndex !== -1) {
      wpgCancelOffTimer();
      wpgCancelIncreaseLock();
      if (wpgCurrentIndex !== manualIndex) {
        await wpgApplyLevel(manualIndex, "Manuelles Laden", 0);
      } else {
        await wpgWriteStatusForWattpilot();
      }
      return;
    }
    if (!wpgCarConnected || wpgChargingComplete) {
      wpgCancelOffTimer();
      wpgCancelIncreaseLock();
      if (wpgCurrentIndex !== -1) {
        wpgCurrentIndex = -1;
        wpgCurrentPhase = null;
        await wpgStopLoading();
        await wpgWriteStatusForWattpilot(true);
      } else {
        await wpgWriteStatusForWattpilot();
      }
      return;
    }
    const newIndex = wpgCalculateIndex(wpgGridPower);
    if (newIndex === -1) {
      if (wpgCurrentIndex === -1) {
        wpgCancelOffTimer();
        await wpgWriteStatusForWattpilot();
        return;
      }
      const sp = import_data.WPG_CHARGE_CURVE[wpgCurrentIndex][2];
      const lowest = import_data.WPG_CHARGE_CURVE.findIndex((level) => level[2] === sp);
      if (wpgCurrentIndex !== lowest) {
        wpgCurrentIndex = lowest;
        const [, ampere] = import_data.WPG_CHARGE_CURVE[lowest];
        wpgLogging(
          `\xDCberschuss reicht nicht mehr f\xFCr aktuelle Stufe \u2014 reduziere auf Minimum: ${wpgLevelLabel(lowest)}`
        );
        await adapter.setStateChangedAsync(WPG_FRONIUS_SET_POWER, ampere, false);
        await wpgWriteStatusForWattpilot(true);
      } else {
        await wpgWriteStatusForWattpilot();
      }
      wpgScheduleOffTimer();
      return;
    }
    wpgCancelOffTimer();
    if (wpgCurrentIndex === -1) {
      await wpgApplyLevel(WPG_START_INDEX, "Ladestart", WPG_START_HOLD_MS);
      return;
    }
    if (newIndex === wpgCurrentIndex) {
      await wpgWriteStatusForWattpilot();
      return;
    }
    if (newIndex < wpgCurrentIndex) {
      const [, ampere, singlePhase2] = import_data.WPG_CHARGE_CURVE[newIndex];
      if (wpgCurrentPhase !== null && wpgCurrentPhase !== singlePhase2) {
        wpgLastPhaseSwitchTime = Date.now();
        wpgLogging(`Phasenwechsel: ${wpgCurrentPhase ? "1P" : "3P"} \u2192 ${singlePhase2 ? "1P" : "3P"}`);
      }
      wpgCurrentIndex = newIndex;
      wpgCurrentPhase = singlePhase2;
      wpgLogging(`Setze Ladung: ${wpgLevelLabel(newIndex)}`);
      await (singlePhase2 ? wpgSetOnePhaseLoading() : wpgSetThreePhaseLoading());
      await adapter.setStateChangedAsync(WPG_FRONIUS_SET_POWER, ampere, false);
      await wpgStartLoading();
      await wpgWriteStatusForWattpilot(true);
      return;
    }
    if (wpgIncreaseLocked()) {
      await wpgWriteStatusForWattpilot();
      return;
    }
    const [, , singlePhase] = import_data.WPG_CHARGE_CURVE[newIndex];
    if (wpgCurrentPhase === true && !singlePhase) {
      wpgLogging(`Phasenwechsel: 1P \u2192 3P`);
      await wpgApplyLevel(WPG_LOWEST_THREE_PHASE_INDEX, "Phasenwechsel-Hochlauf", WPG_START_HOLD_MS);
      return;
    }
    await wpgApplyLevel(newIndex, "Setze Ladung", WPG_STEP_UP_LOCK_MS);
  }
  let oldStatusValue = null;
  let oldCarConnectValue = null;
  async function stateChangeHandler(id, state) {
    var _a2, _b2;
    if (!(0, import_utils.isDefined)(state)) {
      return;
    }
    switch (id) {
      case WPG_GRID_POWER_ID:
        wpgRawGridPower = state.val;
        wpgGridPower = wpgComputeAvailableSurplus();
        await wpgEvaluateAndSwitch();
        return;
      case WPG_BATTERY_POWER_ID:
        wpgBatteryPower = state.val;
        wpgGridPower = wpgComputeAvailableSurplus();
        await wpgEvaluateAndSwitch();
        return;
      case WPG_CAR_CONNECTED_ID: {
        if (!(0, import_state.stateChanged)(state, oldCarConnectValue)) {
          return;
        }
        const val = state.val;
        oldCarConnectValue = val;
        wpgCarConnected = WPG_CONNECTED_STATUSES.includes(val);
        wpgLogging(`Auto: ${val} \u2192 carConnected: ${wpgCarConnected}`);
        await wpgEvaluateAndSwitch();
        return;
      }
      case WPG_CHARGING_MODE_ID:
        if (!(0, import_state.stateChanged)(state, wpgChargingMode)) {
          return;
        }
        wpgChargingMode = state.val;
        wpgLogging(`Lademodus: ${wpgChargingMode}`);
        await wpgEvaluateAndSwitch();
        await wpgAckState(WPG_CHARGING_MODE_ID, wpgChargingMode);
        return;
      case WPG_ENABLE_LOGGING_ID:
        if (!(0, import_state.stateChanged)(state, wpgEnableLogging)) {
          return;
        }
        wpgEnableLogging = !!state.val;
        console.log(`[Wattpilot] Logging: ${wpgEnableLogging}`);
        await wpgAckState(WPG_ENABLE_LOGGING_ID, state.val);
        return;
      case WPG_GRID_DRAW_ALLOWANCE_ID:
        if (!(0, import_state.stateChanged)(state, wpgGridDrawAllowanceWatt)) {
          return;
        }
        wpgGridDrawAllowanceWatt = (_a2 = state.val) != null ? _a2 : 0;
        wpgLogging(`Netzbezugs-Freigabe (1P6A): ${wpgGridDrawAllowanceWatt}W`);
        await wpgEvaluateAndSwitch();
        await wpgAckState(WPG_GRID_DRAW_ALLOWANCE_ID, state.val);
        return;
      case WPG_CHARGING_STATUS_ID: {
        if (!(0, import_state.stateChanged)(state, oldStatusValue)) {
          return;
        }
        oldStatusValue = state.val;
        const parsedStatus = wpgParseChargingStatus(state.val);
        if (!parsedStatus) {
          return;
        }
        wpgChargingComplete = parsedStatus.chargingComplete;
        wpgLogging(`Ladung abgeschlossen: ${wpgChargingComplete}`);
        await wpgEvaluateAndSwitch();
        return;
      }
      case WPG_ACTUAL_POWER_ID:
        wpgActualPower = ((_b2 = state.val) != null ? _b2 : 0) * 1e3;
        if (wpgChargingMode === import_enum.ChargingStatusEnum.AUTO && wpgCurrentIndex === -1 && wpgActualPower > WPG_ACTUAL_POWER_ON_THRESHOLD) {
          wpgLogging(
            `Sync-Problem erkannt: Wallbox l\xE4dt bereits (${wpgActualPower}W), Skript-Index ist -1 \u2014 initialisiere neu`
          );
          await wpgResync();
        }
    }
  }
  async function wpgSetOnePhaseLoading() {
    await adapter.setStateChangedAsync(WPG_FRONIUS_SET_STATE, "psm;1", false);
  }
  async function wpgSetThreePhaseLoading() {
    await adapter.setStateChangedAsync(WPG_FRONIUS_SET_STATE, "psm;2", false);
  }
  async function wpgStartLoading() {
    await adapter.setStateChangedAsync(WPG_FRONIUS_SET_STATE, "frc;0", false);
  }
  async function wpgStopLoading() {
    wpgLogging(`Laden gestoppt`);
    await adapter.setStateChangedAsync(WPG_FRONIUS_SET_STATE, "frc;1", false);
  }
  return { stateChangeHandler };
}
const wattPilot = { init };
var wattpilot_default = wattPilot;
//# sourceMappingURL=wattpilot.js.map
