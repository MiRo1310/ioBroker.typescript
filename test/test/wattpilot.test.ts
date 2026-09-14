import { expect } from 'chai';
import { describe, it, beforeEach } from 'mocha';
import { utils } from '@iobroker/testing';

import wattpilot from '../../src/scripts/wattpilot/wattpilot';
import { ChargingStatusEnum } from '../../src/enum/enum';

type Val = string | number | boolean;

const SET_STATE_ID = 'fronius-wattpilot.0.set_state';
const SET_POWER_ID = 'fronius-wattpilot.0.set_power';

const ACTUAL_POWER_ID = 'fronius-wattpilot.0.power';
const CAR_CONNECTED_ID = 'fronius-wattpilot.0.carConnected';
const GRID_POWER_ID = 'modbus.0.holdingRegisters.41079_grid_Power';
const BATTERY_POWER_ID = 'modbus.0.holdingRegisters.41067_Active_Power';
const STATUS_STATE_ID = '0_userdata.0.Wattpilot.WattpilotScriptJson';
const CHARGING_MODE_ID = '0_userdata.0.Wattpilot.chargingMode';
const GRID_DRAW_ALLOWANCE_ID = '0_userdata.0.Wattpilot.gridDrawAllowanceWatt';

function mkState(val: Val, ack: boolean): ioBroker.State {
    return { val, ack, ts: Date.now(), lc: Date.now(), from: 'system.adapter.test.0', q: 0 };
}

describe('Wattpilot PV-Überschussladen', () => {
    const { adapter, database } = utils.unit.createMocks({});

    // @iobroker/testing stubbt setTimeout/clearTimeout nicht. Der Adapter nutzt sie für die
    // Off-Delay- und Hochschalt-Sperre-Timer - hier reicht ein no-op, da kein Test darauf wartet,
    // dass ein Timer tatsächlich abläuft (reale Timer würden den Testprozess unnötig offen halten).
    let nextFakeTimerId = 1;
    (adapter as unknown as { setTimeout: () => number }).setTimeout = (): number => nextFakeTimerId++;
    (adapter as unknown as { clearTimeout: () => void }).clearTimeout = (): void => {};

    beforeEach(() => {
        adapter.resetMock();
        database.clear();
    });

    /**
     * Seedet die übergebenen States, initialisiert das Modul und liefert eine
     * Funktion zum Feuern von stateChange-Events gegen den zurückgegebenen Handler.
     *
     * @param seed Initiale States, die vor dem Aufruf von `init()` gesetzt werden
     */
    async function setup(
        seed: Record<string, Val> = {},
    ): Promise<(id: string, val: Val, ack?: boolean) => Promise<void>> {
        for (const [id, val] of Object.entries(seed)) {
            await adapter.setForeignStateAsync(id, val, true);
        }
        const { stateChangeHandler } = await wattpilot.init(adapter);
        const handler = stateChangeHandler as unknown as (id: string, state?: ioBroker.State | null) => Promise<void>;
        return async (id, val, ack = false): Promise<void> => {
            await handler(id, mkState(val, ack));
        };
    }

    async function statusJson(): Promise<any> {
        const state = await adapter.getForeignStateAsync(STATUS_STATE_ID);
        return JSON.parse(state?.val as string);
    }

    it('startet Ladung bei ausreichendem Überschuss (Kaltstart 1P6A)', async () => {
        const fire = await setup({
            [CHARGING_MODE_ID]: ChargingStatusEnum.AUTO,
            [CAR_CONNECTED_ID]: 'Charging',
            [BATTERY_POWER_ID]: 0,
        });

        await fire(GRID_POWER_ID, 1500);

        expect((await adapter.getForeignStateAsync(SET_STATE_ID))?.val).to.equal('frc;0');
        expect((await adapter.getForeignStateAsync(SET_POWER_ID))?.val).to.equal(6);

        const status = await statusJson();
        expect(status.charging).to.equal(true);
        expect(status.currentIndex).to.equal(0);
        expect(status.singlePhase).to.equal(true);
        expect(status.increaseLockActive).to.equal(true); // Hochschalt-Sperre nach Kaltstart
    });

    it('bleibt aus, wenn der Überschuss nicht einmal für 1P6A reicht', async () => {
        const fire = await setup({
            [CHARGING_MODE_ID]: ChargingStatusEnum.AUTO,
            [CAR_CONNECTED_ID]: 'Charging',
            [BATTERY_POWER_ID]: 0,
        });

        await fire(GRID_POWER_ID, 1000); // < 1380W Mindestschwelle für 1P6A

        expect((await adapter.getForeignStateAsync(SET_POWER_ID))?.val).to.equal(undefined);
        expect((await adapter.getForeignStateAsync(SET_STATE_ID))?.val).to.equal('frc;1'); // weiterhin gestoppt (vom Start)
    });

    it('Netzbezugs-Freigabe hält 1P6A trotz leichtem Netzbezug', async () => {
        const fire = await setup({
            [CHARGING_MODE_ID]: ChargingStatusEnum.AUTO,
            [CAR_CONNECTED_ID]: 'Charging',
            [BATTERY_POWER_ID]: 0,
            [GRID_DRAW_ALLOWANCE_ID]: 200,
        });

        await fire(GRID_POWER_ID, 1200); // 180W Netzbezug, innerhalb der 200W-Freigabe

        expect((await adapter.getForeignStateAsync(SET_POWER_ID))?.val).to.equal(6);
        const status = await statusJson();
        expect(status.currentIndex).to.equal(0);
        expect(status.gridDrawAllowanceUsedPercent).to.equal(90);
    });

    it('Hysterese: hält die Stufe, wenn der Überschuss nur knapp unter die Schwelle fällt', async () => {
        const fire = await setup({
            [CAR_CONNECTED_ID]: 'Charging',
            [BATTERY_POWER_ID]: 0,
        });

        // Manuell auf 1P10A (Schwelle 2300W) setzen, unabhängig vom Überschuss
        await fire(CHARGING_MODE_ID, ChargingStatusEnum['1P10A']);
        expect((await adapter.getForeignStateAsync(SET_POWER_ID))?.val).to.equal(10);

        // Überschuss liegt 150W unter der Schwelle, aber innerhalb der 200W-Hysterese
        await fire(GRID_POWER_ID, -150);
        // Auf Automatik umschalten - darf wegen Hysterese NICHT runterschalten
        await fire(CHARGING_MODE_ID, ChargingStatusEnum.AUTO);

        expect((await adapter.getForeignStateAsync(SET_POWER_ID))?.val).to.equal(10); // unverändert
    });

    it('ack-Rückschreiben löst keinen erneuten Durchlauf aus (kein Endlos-Loop)', async () => {
        const fire = await setup({});

        await fire(CHARGING_MODE_ID, ChargingStatusEnum.AUTO, false);
        const callsAfterFirst = (adapter.setForeignStateAsync as unknown as { callCount: number }).callCount;
        expect(callsAfterFirst).to.be.greaterThan(0); // ack wurde geschrieben

        // Simuliert das eigene ack=true-Echo, das durch obigen setState-Aufruf entsteht
        await fire(CHARGING_MODE_ID, ChargingStatusEnum.AUTO, true);

        expect((adapter.setForeignStateAsync as unknown as { callCount: number }).callCount).to.equal(callsAfterFirst);
    });

    it('manueller Modus setzt die Stufe direkt, ohne Überschussprüfung (3-phasig)', async () => {
        const fire = await setup({});

        await fire(CHARGING_MODE_ID, ChargingStatusEnum['3P10A']);

        expect((await adapter.getForeignStateAsync(SET_POWER_ID))?.val).to.equal(10);
        expect((await adapter.getForeignStateAsync(SET_STATE_ID))?.val).to.equal('frc;0'); // lädt

        const status = await statusJson();
        expect(status.singlePhase).to.equal(false);
        expect(status.phases).to.equal(3);
    });

    it('DISABLED beendet eine laufende Ladung', async () => {
        const fire = await setup({});

        await fire(CHARGING_MODE_ID, ChargingStatusEnum['1P10A']);
        expect((await adapter.getForeignStateAsync(SET_STATE_ID))?.val).to.equal('frc;0');

        await fire(CHARGING_MODE_ID, ChargingStatusEnum.DISABLED);

        expect((await adapter.getForeignStateAsync(SET_STATE_ID))?.val).to.equal('frc;1');
        const status = await statusJson();
        expect(status.charging).to.equal(false);
    });

    it('erkennt eigenständig ladende Wallbox (Sync-Problem) und initialisiert neu', async () => {
        const fire = await setup({
            [CHARGING_MODE_ID]: ChargingStatusEnum.AUTO,
            [CAR_CONNECTED_ID]: 'Charging',
        });

        const callsBefore = (adapter.setForeignStateChangedAsync as unknown as { callCount: number }).callCount;

        // Wallbox lädt bereits (500W), Skript-Index ist aber noch -1 -> Resync
        await fire(ACTUAL_POWER_ID, 0.5);

        expect((adapter.setForeignStateChangedAsync as unknown as { callCount: number }).callCount).to.be.greaterThan(
            callsBefore,
        );
        const status = await statusJson();
        expect(status.charging).to.equal(false); // ohne bekannten Überschuss bleibt sie aus
    });
});
