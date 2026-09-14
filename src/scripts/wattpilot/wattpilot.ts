/**
 * PV surplus charging with fine-grained level control
 *
 * Input:  grid power (Modbus)
 * Output: wattpilot set_state (psm, frc) + set_power
 */
import { ChargingStatusEnum } from '../../enum/enum';
import type { ChargingStatusMode, WpgStatus, WpgWallboxChargingStatus } from './types';
import { WPG_BATTERY_CONTRIBUTION_BANDS, WPG_CHARGE_CURVE } from './data';
import type { TypeScript } from '../../main';
import type { ReturnTypeInit, ScriptModule } from '../types';
import { isDefined } from '../../lib/utils';
import { stateChanged } from '../../lib/state';

const WPG_FRONIUS_SET_STATE = 'fronius-wattpilot.0.set_state';
const WPG_FRONIUS_SET_POWER = 'fronius-wattpilot.0.set_power';
const WPG_ACTUAL_POWER_ID = 'fronius-wattpilot.0.power';
const WPG_CAR_CONNECTED_ID = 'fronius-wattpilot.0.carConnected';

const WPG_GRID_POWER_ID = 'modbus.0.holdingRegisters.41079_grid_Power';
const WPG_BATTERY_POWER_ID = 'modbus.0.holdingRegisters.41067_Active_Power';

const WPG_STATUS_STATE_ID = '0_userdata.0.Wattpilot.WattpilotScriptJson';
const WPG_CHARGING_MODE_ID = '0_userdata.0.Wattpilot.chargingMode';
const WPG_CHARGING_STATUS_ID = '0_userdata.0.Wattpilot.ChargingStatus';
const WPG_ENABLE_LOGGING_ID = '0_userdata.0.Wattpilot.enableLogging';
const WPG_GRID_DRAW_ALLOWANCE_ID = '0_userdata.0.Wattpilot.gridDrawAllowanceWatt';

const WPG_CONNECTED_STATUSES = ['Complete', 'Charging'];
const WPG_ACTUAL_POWER_ON_THRESHOLD = 100; // W — oberhalb davon gilt die Wallbox als "lädt bereits"

const WPG_STATUS_WRITE_INTERVAL_MS = 10_000;
let wpgLastStatusWriteTime = 0;

const WPG_HYSTERESIS_W = 200;
const WPG_PHASE_SWITCH_UP_COOLDOWN_MS = 2 * 60 * 1000; // 1P -> 3P (hochschalten): träge, da Überschuss stabil sein soll
const WPG_PHASE_SWITCH_DOWN_COOLDOWN_MS = 10 * 1000; // 3P -> 1P (runterschalten): kurz, schnelle Reaktion bei sinkendem Überschuss
const WPG_OFF_DELAY_MS = 10 * 1000; // Ausschalten
const WPG_START_HOLD_MS = 30 * 1000; // Kaltstart / Phasenwechsel 1P->3P: Hardware braucht ~20s zum Hochfahren
const WPG_STEP_UP_LOCK_MS = 10 * 1000; // normale Stufenerhöhung ohne Phasenwechsel: kurze Sperre gegen Hin-und-Her
const WPG_START_INDEX = 0; // lowest level: 1P 6A — gives the wallbox a stable point to start from

async function init(adapter: TypeScript): ReturnTypeInit {
    await adapter.subscribeForeignStatesAsync([
        WPG_ACTUAL_POWER_ID,
        WPG_CAR_CONNECTED_ID,
        WPG_GRID_POWER_ID,
        WPG_BATTERY_POWER_ID,
        WPG_STATUS_STATE_ID,
        WPG_CHARGING_MODE_ID,
        WPG_CHARGING_STATUS_ID,
        WPG_ENABLE_LOGGING_ID,
        WPG_GRID_DRAW_ALLOWANCE_ID,
    ]);

    function wpgParseChargingStatus(val?: string): WpgWallboxChargingStatus | undefined {
        if (!val) {
            return;
        }
        try {
            return JSON.parse(val) as WpgWallboxChargingStatus;
        } catch (e) {
            console.error('[Wattpilot] Error parsing WallboxChargingStatus: ', e);
        }
    }

    // Niedrigste 3P-Stufe — Ausgangspunkt beim Hochschalten 1P → 3P (siehe WPG_START_HOLD_MS)
    const WPG_LOWEST_THREE_PHASE_INDEX = WPG_CHARGE_CURVE.findIndex(level => !level[2]);

    // Nutzt aus, dass die Level-Werte in ChargingStatusEnum (siehe dort) in derselben
    // Reihenfolge wie WPG_CHARGE_CURVE deklariert sind und AUTO/DISABLED danach kommen —
    // deren Index liegt also immer >= WPG_CHARGE_CURVE.length.
    function wpgManualLevelIndexForMode(mode: ChargingStatusMode): number {
        const index = Object.values(ChargingStatusEnum).indexOf(mode);
        return index < WPG_CHARGE_CURVE.length ? index : -1;
    }

    function wpgBatteryContribution(batteryPower: number): number {
        for (let i = WPG_BATTERY_CONTRIBUTION_BANDS.length - 1; i >= 0; i--) {
            if (batteryPower >= WPG_BATTERY_CONTRIBUTION_BANDS[i][0]) {
                return WPG_BATTERY_CONTRIBUTION_BANDS[i][1];
            }
        }
        return 0;
    }

    let wpgCurrentIndex = -1;
    let wpgCurrentPhase: boolean | null = null;
    let wpgLastPhaseSwitchTime = 0;
    let wpgOffTimer: ioBroker.Timeout | undefined;
    let wpgIncreaseLockTimer: ioBroker.Timeout | undefined;
    let wpgIncreaseLockedUntil = 0;
    let wpgRawGridPower = 0;
    let wpgGridPower = 0;
    let wpgBatteryPower = 0;
    let wpgCarConnected = false;
    let wpgChargingMode: ChargingStatusMode = ChargingStatusEnum.DISABLED;
    let wpgActualPower = 0;
    let wpgChargingComplete = false;
    let wpgEnableLogging = true;
    let wpgGridDrawAllowanceWatt = 0;

    const wpgInitBattery = await adapter.getForeignStateAsync(WPG_BATTERY_POWER_ID);
    if (wpgInitBattery) {
        wpgBatteryPower = wpgInitBattery.val as number;
    }

    const wpgInitCar = await adapter.getForeignStateAsync(WPG_CAR_CONNECTED_ID);
    if (wpgInitCar) {
        wpgCarConnected = WPG_CONNECTED_STATUSES.includes(wpgInitCar.val as string);
    }

    const wpgInitChargingMode = await adapter.getForeignStateAsync(WPG_CHARGING_MODE_ID);
    if (wpgInitChargingMode) {
        wpgChargingMode = wpgInitChargingMode.val as ChargingStatusMode;
    }

    const wpgInitEnableLogging = await adapter.getForeignStateAsync(WPG_ENABLE_LOGGING_ID);
    if (wpgInitEnableLogging) {
        wpgEnableLogging = !!wpgInitEnableLogging.val;
    }

    const wpgInitGridDrawAllowance = await adapter.getForeignStateAsync(WPG_GRID_DRAW_ALLOWANCE_ID);
    if (wpgInitGridDrawAllowance) {
        wpgGridDrawAllowanceWatt = (wpgInitGridDrawAllowance.val as number) ?? 0;
    }

    const wpgInitChargingStatus = wpgParseChargingStatus(
        (await adapter.getForeignStateAsync(WPG_CHARGING_STATUS_ID))?.val as string | undefined,
    );
    if (wpgInitChargingStatus) {
        wpgChargingComplete = wpgInitChargingStatus.chargingComplete;
    }

    const wpgInitPower = await adapter.getForeignStateAsync(WPG_ACTUAL_POWER_ID);
    if (wpgInitPower) {
        wpgActualPower = ((wpgInitPower.val as number) ?? 0) * 1000; // DP liefert kW, intern wird mit Watt gerechnet
    }

    // Reset wallbox to known state on startup
    await wpgStopLoading();
    wpgLogging(`Script gestartet — Auto: ${wpgCarConnected} | Modus: ${wpgChargingMode} | Wallbox gestoppt (frc;1)`);

    function wpgLogging(msg: string, type: 'log' | 'debug' = 'log'): void {
        if (!wpgEnableLogging) {
            return;
        }
        console[type](`[Wattpilot] ${msg}`);
    }

    // Bestätigt ein per Kommando (ack=false) gesetztes State mit ack=true, sobald
    // die daraus resultierende Änderung verarbeitet wurde. Für beliebige State-IDs nutzbar.
    async function wpgAckState(id: string, val: string | number | boolean | null): Promise<void> {
        await adapter.setForeignStateAsync(id, val, true);
    }

    function wpgComputeAvailableSurplus(): number {
        // Batterie entlädt (negativ): nicht mitzählen, sonst würde die Wallbox die Batterie leerziehen
        if (wpgBatteryPower < 0) {
            const result = wpgRawGridPower + wpgBatteryPower;
            wpgLogging(
                `Überschuss: Grid ${wpgRawGridPower}W + Batterie (entlädt) ${wpgBatteryPower}W = ${result}W`,
                'debug',
            );
            return result;
        }
        // Batterie lädt (positiv): Beitrag kommt bandweise aus WPG_BATTERY_CONTRIBUTION_BANDS statt stufenlos
        const contribution = wpgBatteryContribution(wpgBatteryPower);
        const result = wpgRawGridPower + contribution;
        wpgLogging(
            `Überschuss: Grid ${wpgRawGridPower}W + Batterie-Beitrag ${contribution}W (Batterie lädt ${wpgBatteryPower}W, Band) = ${result}W`,
            'debug',
        );
        return result;
    }

    function wpgLevelLabel(index: number): string {
        if (index < 0) {
            return 'off';
        }
        const [watt, ampere, sp] = WPG_CHARGE_CURVE[index];
        return `${sp ? '1P' : '3P'} ${ampere}A = ${(watt / 1000).toFixed(2)} kW`;
    }

    function wpgCalculateIndex(surplus: number): number {
        const chargingPower = wpgCurrentIndex >= 0 ? WPG_CHARGE_CURVE[wpgCurrentIndex][0] : 0;
        const available = surplus + chargingPower;

        let target = -1;
        for (let i = WPG_CHARGE_CURVE.length - 1; i >= 0; i--) {
            if (available >= WPG_CHARGE_CURVE[i][0]) {
                target = i;
                break;
            }
        }

        // Netzbezugs-Freigabe: die unterste Stufe (1P6A) darf trotz leichtem
        // Netzbezug gehalten/gestartet werden, damit knapper Überschuss nicht
        // "verschenkt" wird. Gilt nur für 1P6A, höhere Stufen bleiben strikt
        // überschussbasiert.
        if (
            target === -1 &&
            wpgGridDrawAllowanceWatt > 0 &&
            available >= WPG_CHARGE_CURVE[0][0] - wpgGridDrawAllowanceWatt
        ) {
            target = 0;
            wpgLogging(
                `Netzbezugs-Freigabe: halte ${wpgLevelLabel(0)} trotz Netzbezug (${available}W verfügbar, Freigabe ${wpgGridDrawAllowanceWatt}W)`,
            );
        }

        // Hysteresis: don't step down if still within band
        if (wpgCurrentIndex >= 0 && target < wpgCurrentIndex) {
            const threshold = WPG_CHARGE_CURVE[wpgCurrentIndex][0];
            if (available >= threshold - WPG_HYSTERESIS_W) {
                wpgLogging(
                    `Hysterese: bleibe bei ${wpgLevelLabel(wpgCurrentIndex)} (${available}W ≥ ${threshold - WPG_HYSTERESIS_W}W)`,
                );
                return wpgCurrentIndex;
            }
        }

        // Phase switch cooldown
        if (
            target >= 0 &&
            wpgCurrentIndex >= 0 &&
            WPG_CHARGE_CURVE[target][2] !== WPG_CHARGE_CURVE[wpgCurrentIndex][2]
        ) {
            const switchingDown = WPG_CHARGE_CURVE[target][2]; // target ist 1P => Runterschalten von 3P auf 1P
            const cooldownMs = switchingDown ? WPG_PHASE_SWITCH_DOWN_COOLDOWN_MS : WPG_PHASE_SWITCH_UP_COOLDOWN_MS;
            const elapsed = Date.now() - wpgLastPhaseSwitchTime;
            if (elapsed < cooldownMs) {
                const remaining = Math.round((cooldownMs - elapsed) / 1000);
                const sp = WPG_CHARGE_CURVE[wpgCurrentIndex][2];
                let best = -1;
                for (let i = WPG_CHARGE_CURVE.length - 1; i >= 0; i--) {
                    if (WPG_CHARGE_CURVE[i][2] === sp && available >= WPG_CHARGE_CURVE[i][0]) {
                        best = i;
                        break;
                    }
                }
                if (best >= 0) {
                    wpgLogging(`Phasenwechsel-Cooldown (${remaining}s): bleibe bei ${sp ? '1P' : '3P'}, Index ${best}`);
                    return best;
                }
                // Not even the lowest level of the current phase fits anymore, but the
                // cooldown forbids switching phase — hold the lowest level of the
                // current phase (drawing a bit from the grid) rather than switching
                // phase early or shutting off entirely.
                const lowest = WPG_CHARGE_CURVE.findIndex(level => level[2] === sp);
                wpgLogging(
                    `Phasenwechsel-Cooldown (${remaining}s): halte Mindeststufe ${wpgLevelLabel(lowest)} (Netzbezug möglich)`,
                );
                return lowest;
            }
        }

        return target;
    }

    async function wpgWriteStatusForWattpilot(force = false): Promise<void> {
        const now = Date.now();
        if (!force && now - wpgLastStatusWriteTime < WPG_STATUS_WRITE_INTERVAL_MS) {
            return;
        }
        wpgLastStatusWriteTime = now;

        const charging = wpgCurrentIndex >= 0;
        const level = charging ? WPG_CHARGE_CURVE[wpgCurrentIndex] : null;

        // allowCharging/autoCharging werden aus chargingMode abgeleitet, statt eigene States zu halten.
        const allowCharging = wpgChargingMode !== ChargingStatusEnum.DISABLED;
        const autoCharging = wpgChargingMode === ChargingStatusEnum.AUTO;

        const stopReasons: string[] = [];
        if (!wpgCarConnected) {
            stopReasons.push('Kein Auto angeschlossen');
        }
        if (!allowCharging) {
            stopReasons.push('Laden nicht freigegeben');
        }
        if (!autoCharging) {
            stopReasons.push('Automatikladen nicht aktiv');
        }
        if (wpgChargingComplete) {
            stopReasons.push('Ladung abgeschlossen');
        }
        if (wpgCarConnected && allowCharging && autoCharging && !wpgChargingComplete && !charging) {
            stopReasons.push('Kein ausreichender Überschuss');
        }

        // Tatsächlicher Netzbezug entsteht nur, wenn wegen der Freigabe auf 1P6A
        // gehalten wird, obwohl der Überschuss dafür nicht reicht.
        const actualGridDraw = wpgCurrentIndex === 0 ? Math.max(0, WPG_CHARGE_CURVE[0][0] - wpgGridPower) : 0;
        const gridDrawAllowanceUsedPercent =
            wpgGridDrawAllowanceWatt > 0
                ? Math.min(100, Math.round((actualGridDraw / wpgGridDrawAllowanceWatt) * 100))
                : 0;

        const status: WpgStatus = {
            charging,
            chargingComplete: wpgChargingComplete,
            stopReasons,
            carConnected: wpgCarConnected,
            allowCharging,
            autoCharging,
            currentIndex: wpgCurrentIndex,
            ampere: level ? level[1] : null,
            singlePhase: level ? level[2] : null,
            phases: level ? (level[2] ? 1 : 3) : null,
            chargingPowerW: level ? level[0] : null,
            gridPower: wpgGridPower,
            batteryPower: wpgBatteryPower,
            gridDrawAllowanceUsedPercent,
            increaseLockActive: wpgIncreaseLocked(),
            increaseLockRemainingSeconds: Math.max(0, Math.round((wpgIncreaseLockedUntil - now) / 1000)),
            updatedAt: new Date().toISOString(),
        };
        await adapter.setForeignStateChangedAsync(WPG_STATUS_STATE_ID, JSON.stringify(status), true);
    }

    function wpgCancelOffTimer(): void {
        if (wpgOffTimer !== null) {
            adapter.clearTimeout(wpgOffTimer);
            wpgOffTimer = null;
            wpgLogging(`Ausschaltverzögerung abgebrochen — Überschuss wieder ausreichend`);
        }
    }

    function wpgScheduleOffTimer(): void {
        if (wpgOffTimer !== null) {
            return;
        } // already counting down
        wpgLogging(`Bezug zu gering — Ausschaltverzögerung gestartet (${WPG_OFF_DELAY_MS / 1000}s)`);
        wpgOffTimer = adapter.setTimeout(async () => {
            wpgOffTimer = null;
            wpgCurrentIndex = -1;
            wpgCurrentPhase = null;
            await wpgStopLoading();
            await wpgWriteStatusForWattpilot(true);
        }, WPG_OFF_DELAY_MS);
    }

    function wpgIncreaseLocked(): boolean {
        return Date.now() < wpgIncreaseLockedUntil;
    }

    // Sperrt für durationMs jede weitere Erhöhung der Ladestufe (Runterschalten
    // bleibt davon unberührt — siehe wpgEvaluateAndSwitch). Nötig, weil die
    // Wallbox nach Kaltstart bzw. Phasenwechsel (1P -> 3P) ca. 20s braucht, bis
    // sie tatsächlich mit der angeforderten Stromstärke lädt, und um bei knapp
    // schwankendem Überschuss nicht ständig eine Stufe höher zu springen.
    function wpgLockIncreases(durationMs: number): void {
        wpgIncreaseLockedUntil = Date.now() + durationMs;
        if (wpgIncreaseLockTimer !== null) {
            adapter.clearTimeout(wpgIncreaseLockTimer);
        }
        wpgIncreaseLockTimer = adapter.setTimeout(async () => {
            wpgIncreaseLockTimer = null;
            wpgLogging(`Hochschalt-Sperre beendet — normale Regelung aktiv`);
            await wpgEvaluateAndSwitch();
        }, durationMs);
    }

    function wpgCancelIncreaseLock(): void {
        if (wpgIncreaseLockTimer !== null) {
            adapter.clearTimeout(wpgIncreaseLockTimer);
            wpgIncreaseLockTimer = null;
        }
        wpgIncreaseLockedUntil = 0;
    }

    async function wpgApplyLevel(index: number, reason: string, lockMs: number): Promise<void> {
        const [, ampere, singlePhase] = WPG_CHARGE_CURVE[index];
        // null (Kaltstart) zählt ebenfalls als "gewechselt", damit die
        // Phasenwechsel-Cooldowns auch nach einem Stopp wieder von vorne laufen.
        if (wpgCurrentPhase === null || wpgCurrentPhase !== singlePhase) {
            wpgLastPhaseSwitchTime = Date.now();
        }
        wpgCurrentIndex = index;
        wpgCurrentPhase = singlePhase;
        wpgLogging(
            lockMs > 0
                ? `${reason}: ${wpgLevelLabel(index)} für ${lockMs / 1000}s Hochschalt-Sperre`
                : `${reason}: ${wpgLevelLabel(index)}`,
        );

        await (singlePhase ? wpgSetOnePhaseLoading() : wpgSetThreePhaseLoading());
        await adapter.setForeignStateChangedAsync(WPG_FRONIUS_SET_POWER, ampere, false);
        await wpgStartLoading();
        if (lockMs > 0) {
            wpgLockIncreases(lockMs);
        }
        await wpgWriteStatusForWattpilot(true);
    }

    async function wpgResync(): Promise<void> {
        wpgCancelOffTimer();
        wpgCancelIncreaseLock();
        wpgCurrentIndex = -1;
        wpgCurrentPhase = null;
        await wpgStopLoading();
        await wpgWriteStatusForWattpilot(true);
        await wpgEvaluateAndSwitch();
    }

    async function wpgEvaluateAndSwitch(): Promise<void> {
        wpgLogging(
            `Grid: ${wpgGridPower}W | Batterie: ${wpgBatteryPower}W | Auto: ${wpgCarConnected} | Modus: ${wpgChargingMode} | Stufe: ${wpgLevelLabel(wpgCurrentIndex)}`,
            'debug',
        );

        if (wpgChargingMode === ChargingStatusEnum.DISABLED) {
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

        // Manuelle Stufe: direkt setzen, ohne Überschussberechnung, Hysterese,
        // Phasenwechsel-Cooldown oder Hochschalt-Sperre — "so dass ich auch
        // manuell laden kann".
        const manualIndex = wpgManualLevelIndexForMode(wpgChargingMode);
        if (manualIndex !== -1) {
            wpgCancelOffTimer();
            wpgCancelIncreaseLock();
            if (wpgCurrentIndex !== manualIndex) {
                await wpgApplyLevel(manualIndex, 'Manuelles Laden', 0);
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

            // Surplus doesn't even cover the current level anymore. Runterschalten
            // darf immer sofort passieren, auch während einer aktiven Hochschalt-
            // Sperre. Vor Ablauf der Ausschaltverzögerung erst auf die Mindeststufe
            // der aktuellen Phase (6A) reduzieren statt weiter die höhere, nicht
            // mehr gedeckte Stromstärke zu ziehen.
            const sp = WPG_CHARGE_CURVE[wpgCurrentIndex][2];
            const lowest = WPG_CHARGE_CURVE.findIndex(level => level[2] === sp);
            if (wpgCurrentIndex !== lowest) {
                wpgCurrentIndex = lowest;
                const [, ampere] = WPG_CHARGE_CURVE[lowest];
                wpgLogging(
                    `Überschuss reicht nicht mehr für aktuelle Stufe — reduziere auf Minimum: ${wpgLevelLabel(lowest)}`,
                );
                await adapter.setForeignStateChangedAsync(WPG_FRONIUS_SET_POWER, ampere, false);
                await wpgWriteStatusForWattpilot(true);
            } else {
                await wpgWriteStatusForWattpilot();
            }

            wpgScheduleOffTimer();
            return;
        }

        wpgCancelOffTimer();

        if (wpgCurrentIndex === -1) {
            // Kaltstart: immer 1P Minimum, danach Hochschalt-Sperre (Hardware
            // braucht ~20s, bis sie tatsächlich mit voller Stufe lädt).
            await wpgApplyLevel(WPG_START_INDEX, 'Ladestart', WPG_START_HOLD_MS);
            return;
        }

        if (newIndex === wpgCurrentIndex) {
            await wpgWriteStatusForWattpilot();
            return;
        }

        // Runterschalten darf immer sofort passieren, auch während einer aktiven
        // Hochschalt-Sperre — nur das Hochschalten wird gebremst.
        if (newIndex < wpgCurrentIndex) {
            const [, ampere, singlePhase] = WPG_CHARGE_CURVE[newIndex];
            if (wpgCurrentPhase !== null && wpgCurrentPhase !== singlePhase) {
                wpgLastPhaseSwitchTime = Date.now();
                wpgLogging(`Phasenwechsel: ${wpgCurrentPhase ? '1P' : '3P'} → ${singlePhase ? '1P' : '3P'}`);
            }
            wpgCurrentIndex = newIndex;
            wpgCurrentPhase = singlePhase;
            wpgLogging(`Setze Ladung: ${wpgLevelLabel(newIndex)}`);
            await (singlePhase ? wpgSetOnePhaseLoading() : wpgSetThreePhaseLoading());
            await adapter.setForeignStateChangedAsync(WPG_FRONIUS_SET_POWER, ampere, false);
            await wpgStartLoading();
            await wpgWriteStatusForWattpilot(true);
            return;
        }

        // Ab hier: newIndex > wpgCurrentIndex, also Hochschalten — durch eine
        // aktive Sperre gebremst (Kaltstart/Phasenwechsel-Hochlauf oder normale
        // Stufenerhöhung, siehe wpgApplyLevel-Aufrufe unten).
        if (wpgIncreaseLocked()) {
            await wpgWriteStatusForWattpilot();
            return;
        }

        const [, , singlePhase] = WPG_CHARGE_CURVE[newIndex];

        // Hochschalten 1P -> 3P: die Wallbox braucht nach dem Phasenwechsel ca.
        // 20s, bis sie tatsächlich lädt. Erst auf die niedrigste 3P-Stufe gehen
        // und für WPG_START_HOLD_MS sperren, statt direkt auf newIndex zu springen.
        if (wpgCurrentPhase === true && !singlePhase) {
            wpgLogging(`Phasenwechsel: 1P → 3P`);
            await wpgApplyLevel(WPG_LOWEST_THREE_PHASE_INDEX, 'Phasenwechsel-Hochlauf', WPG_START_HOLD_MS);
            return;
        }

        // Normale Stufenerhöhung ohne Phasenwechsel: kurze Sperre gegen Hin-und-Her.
        await wpgApplyLevel(newIndex, 'Setze Ladung', WPG_STEP_UP_LOCK_MS);
    }

    let oldStatusValue: string | number | boolean | null = null;
    let oldCarConnectValue: string | number | boolean | null = null;

    async function stateChangeHandler(id: string, state?: ioBroker.State | null): Promise<void> {
        if (!isDefined(state)) {
            return;
        }
        switch (id) {
            case WPG_GRID_POWER_ID:
                wpgRawGridPower = state.val as number;
                wpgGridPower = wpgComputeAvailableSurplus();
                await wpgEvaluateAndSwitch();
                return;
            case WPG_BATTERY_POWER_ID:
                wpgBatteryPower = state.val as number;
                wpgGridPower = wpgComputeAvailableSurplus();
                await wpgEvaluateAndSwitch();
                return;
            case WPG_CAR_CONNECTED_ID: {
                if (!stateChanged(state, oldCarConnectValue)) {
                    return;
                }
                const val = state.val as string;
                oldCarConnectValue = val;
                wpgCarConnected = WPG_CONNECTED_STATUSES.includes(val);
                wpgLogging(`Auto: ${val} → carConnected: ${wpgCarConnected}`);
                await wpgEvaluateAndSwitch();
                return;
            }
            case WPG_CHARGING_MODE_ID:
                if (!stateChanged(state, wpgChargingMode)) {
                    return;
                }
                wpgChargingMode = state.val as ChargingStatusMode;
                wpgLogging(`Lademodus: ${wpgChargingMode}`);
                await wpgEvaluateAndSwitch();
                await wpgAckState(WPG_CHARGING_MODE_ID, wpgChargingMode);
                return;
            case WPG_ENABLE_LOGGING_ID:
                if (!stateChanged(state, wpgEnableLogging)) {
                    return;
                }
                wpgEnableLogging = !!state.val;
                console.log(`[Wattpilot] Logging: ${wpgEnableLogging}`);
                await wpgAckState(WPG_ENABLE_LOGGING_ID, state.val);
                return;
            case WPG_GRID_DRAW_ALLOWANCE_ID:
                if (!stateChanged(state, wpgGridDrawAllowanceWatt)) {
                    return;
                }
                wpgGridDrawAllowanceWatt = (state.val as number) ?? 0;
                wpgLogging(`Netzbezugs-Freigabe (1P6A): ${wpgGridDrawAllowanceWatt}W`);
                await wpgEvaluateAndSwitch();
                await wpgAckState(WPG_GRID_DRAW_ALLOWANCE_ID, state.val);
                return;
            case WPG_CHARGING_STATUS_ID: {
                if (!stateChanged(state, oldStatusValue)) {
                    return;
                }
                oldStatusValue = state.val;
                const parsedStatus = wpgParseChargingStatus(state.val as string | undefined);
                if (!parsedStatus) {
                    return;
                }

                wpgChargingComplete = parsedStatus.chargingComplete;
                wpgLogging(`Ladung abgeschlossen: ${wpgChargingComplete}`);
                await wpgEvaluateAndSwitch();
                return;
            }
            case WPG_ACTUAL_POWER_ID:
                wpgActualPower = ((state.val as number) ?? 0) * 1000; // DP liefert kW, intern wird mit Watt gerechnet

                // Die Wallbox kann beim Anschließen des Autos eigenständig (ohne unser
                // frc-Kommando) zu laden beginnen. Dann läuft sie bereits, während unser
                // Index noch -1 (aus) ist — das Skript ist nicht mehr synchron zur
                // tatsächlichen Wallbox-Regelung. In dem Fall neu initialisieren, damit
                // die Überschussregelung wieder die Kontrolle übernimmt.
                if (
                    wpgChargingMode === ChargingStatusEnum.AUTO &&
                    wpgCurrentIndex === -1 &&
                    wpgActualPower > WPG_ACTUAL_POWER_ON_THRESHOLD
                ) {
                    wpgLogging(
                        `Sync-Problem erkannt: Wallbox lädt bereits (${wpgActualPower}W), Skript-Index ist -1 — initialisiere neu`,
                    );
                    await wpgResync();
                }
        }
    }

    async function wpgSetOnePhaseLoading(): Promise<void> {
        await adapter.setForeignStateChangedAsync(WPG_FRONIUS_SET_STATE, 'psm;1', false);
    }

    async function wpgSetThreePhaseLoading(): Promise<void> {
        await adapter.setForeignStateChangedAsync(WPG_FRONIUS_SET_STATE, 'psm;2', false);
    }

    async function wpgStartLoading(): Promise<void> {
        await adapter.setForeignStateChangedAsync(WPG_FRONIUS_SET_STATE, 'frc;0', false);
    }

    async function wpgStopLoading(): Promise<void> {
        wpgLogging(`Laden gestoppt`);
        await adapter.setForeignStateChangedAsync(WPG_FRONIUS_SET_STATE, 'frc;1', false);
    }

    return { stateChangeHandler };
}

const wattPilot: ScriptModule = { init };

export default wattPilot;
