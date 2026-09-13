// Der ioBroker-State speichert den Enum-WERT als Rohwert (z. B. "1 Phase 7a", "auto"),
// also die rechte Seite des "=" oben — siehe wpgManualLevelIndexForMode.
import type { ChargingStatusEnum } from '../enum/enum';

export type ChargingStatusMode = ChargingStatusEnum;

export type WpgChargingLevel = [minWatt: number, ampere: number, singlePhase: boolean];
export type WpgBatteryContributionBand = [minBatteryWatt: number, contributionWatt: number];

export interface WpgStatus {
    charging: boolean;
    chargingComplete: boolean;
    stopReasons: string[];
    carConnected: boolean;
    allowCharging: boolean;
    autoCharging: boolean;
    currentIndex: number;
    ampere: number | null;
    singlePhase: boolean | null;
    phases: 1 | 3 | null;
    chargingPowerW: number | null;
    gridPower: number;
    batteryPower: number;
    gridDrawAllowanceUsedPercent: number;
    increaseLockActive: boolean;
    increaseLockRemainingSeconds: number;
    updatedAt: string;
}

export interface WpgWallboxChargingStatus {
    carConnected: boolean;
    chargingActive: boolean;
    chargingComplete: boolean;
    power: number;
    soc: number | null;
    targetSoc: number | null;
    powerOffDelayRunning: boolean;
    updatedAt: string;
}
