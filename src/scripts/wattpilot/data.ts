// [minimum surplus W, ampere, single-phase]
import type { WpgBatteryContributionBand, WpgChargingLevel } from './types';

export const WPG_CHARGE_CURVE: WpgChargingLevel[] = [
    [1380, 6, true], // 1P  6A =  1.38 kW
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
    [4140, 6, false], // 3P  6A =  4.14 kW
    [4830, 7, false],
    [5520, 8, false],
    [6210, 9, false],
    [6900, 10, false],
    [7590, 11, false],
    [8280, 12, false],
    [8970, 13, false],
    [9660, 14, false],
    [10350, 15, false],
    [11040, 16, false],
];

// [minimale Batterieladeleistung W, davon darf die Wallbox mitnutzen W]
// Bandweise statt stufenlos (Puffer-Abzug), damit kleine Schwankungen der
// Batterieladeleistung nicht bei jeder Änderung sofort den Überschuss und
// damit die Ladestufe der Wallbox verändern ("Springen").
export const WPG_BATTERY_CONTRIBUTION_BANDS: WpgBatteryContributionBand[] = [
    [0, 0],
    [500, 200],
    [1000, 700],
    [1500, 1200],
    [2000, 1700],
];
