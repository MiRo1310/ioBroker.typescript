const path = require('path');
const { expect } = require('chai');
const { tests } = require('@iobroker/testing');
const { ChargingStatusEnum } = require('../build/enum/enum');

const SET_STATE_ID = 'fronius-wattpilot.0.set_state';
const SET_POWER_ID = 'fronius-wattpilot.0.set_power';
const CAR_CONNECTED_ID = 'fronius-wattpilot.0.carConnected';
const GRID_POWER_ID = 'modbus.0.holdingRegisters.41079_grid_Power';
const BATTERY_POWER_ID = 'modbus.0.holdingRegisters.41067_Active_Power';
const CHARGING_MODE_ID = '0_userdata.0.Wattpilot.chargingMode';

function setState(harness, id, val, ack = true) {
    return harness.states.setStateAsync(id, { val, ack });
}

function getState(harness, id) {
    return harness.states.getStateAsync(id);
}

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Pollt statt eines festen Sleeps - robuster gegen IPC-Latenz und schneller im Erfolgsfall
async function waitForState(harness, id, predicate, timeoutMs = 10000, intervalMs = 200) {
    const deadline = Date.now() + timeoutMs;
    let last;
    do {
        last = await getState(harness, id);
        if (predicate(last)) {
            return last;
        }
        await wait(intervalMs);
    } while (Date.now() < deadline);
    return last;
}

// Run integration tests - See https://github.com/ioBroker/testing for a detailed explanation and further options
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        // Jede suite bekommt eine frische DB + einen eigenen Harness. Der Adapter läuft als
        // echter Prozess - stateChange wird hier also wirklich über this.on('stateChange', ...)
        // in main.ts ausgelöst, nicht über einen gemockten Adapter wie in test/test/wattpilot.test.ts.
        suite('Wattpilot: reagiert auf echte stateChange-Events', getHarness => {
            let harness;
            before(() => {
                harness = getHarness();
            });

            it('startet die Ladung bei ausreichendem Überschuss (Kaltstart 1P6A)', async () => {
                // Vor dem Adapterstart gesetzt -> init() liest diese Werte als Anfangszustand ein
                await setState(harness, CHARGING_MODE_ID, ChargingStatusEnum.AUTO);
                await setState(harness, CAR_CONNECTED_ID, 'Charging');
                await setState(harness, BATTERY_POWER_ID, 0);

                await harness.startAdapterAndWait();
                // "alive" wird schon gesetzt, bevor onReady() (und damit subscribeForeignStatesAsync
                // im Wattpilot-Modul) fertig durchgelaufen ist - kurz warten, sonst geht das Event
                // unten verloren, weil noch niemand abonniert hat.
                await wait(500);

                // Erst nach dem Start gesetzt -> löst im laufenden Adapterprozess einen echten
                // stateChange aus, der über scripts/index.ts an das Wattpilot-Modul dispatcht wird
                await setState(harness, GRID_POWER_ID, 1500);

                const setStateResult = await waitForState(harness, SET_STATE_ID, s => s?.val === 'frc;0');
                const setPowerResult = await getState(harness, SET_POWER_ID);

                expect(setStateResult && setStateResult.val).to.equal('frc;0');
                expect(setPowerResult && setPowerResult.val).to.equal(6);
            }).timeout(60000);
        });
    },
});
