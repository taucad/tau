import { describe, expect, it } from 'vitest';

import {
  bambuRemoteName,
  bambuTopic,
  mergeBambuStatus,
  parseBambuCommandPayload,
  parseBambuDiscoveryDatagram,
  parseBambuStatusPayload,
  parseBambuStill,
  parseBambuVersionPayload,
} from '#bambu.protocol.js';

const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);

describe('Bambu protocol admission', () => {
  it('should normalize bounded discovery and reject malformed or oversized datagrams', () => {
    const candidate = parseBambuDiscoveryDatagram({
      datagram: {
        bytes: bytes('NOTIFY * HTTP/1.1\r\nDevName.bambu.com: Workshop\r\nDevModel.bambu.com: X1C\r\n'),
        peer: { address: '192.0.2.10', interface: 'test0', port: 2021 },
      },
      observedAt: '2026-09-14T00:00:00.000Z',
      expiresAt: '2026-09-14T00:00:30.000Z',
    });
    expect(candidate).toMatchObject({
      name: 'Workshop',
      claimedIdentity: { model: 'X1C' },
    });
    expect(
      parseBambuDiscoveryDatagram({
        datagram: {
          bytes: bytes(
            'NOTIFY * HTTP/1.1\r\nDevName.bambu.com: Workshop\r\nDevModel.bambu.com: BL-P001\r\nUSN: 00M00A391800004\r\n',
          ),
          peer: { address: '192.0.2.10', interface: 'test0', port: 2021 },
        },
        observedAt: '2026-09-14T00:00:00.000Z',
        expiresAt: '2026-09-14T00:00:30.000Z',
      }),
    ).toMatchObject({
      claimedIdentity: { model: 'X1C', serial: '00M00A391800004' },
    });
    expect(() =>
      parseBambuDiscoveryDatagram({
        datagram: {
          bytes: bytes('garbage'),
          peer: { address: '192.0.2.10', interface: 'test0', port: 2021 },
        },
        observedAt: '2026-09-14T00:00:00.000Z',
        expiresAt: '2026-09-14T00:00:30.000Z',
      }),
    ).toThrow('BAMBU_DISCOVERY_INVALID');
    expect(() =>
      parseBambuDiscoveryDatagram({
        datagram: {
          bytes: bytes('NOTIFY * HTTP/1.1\r\nDevModel.bambu.com: C12\r\nUSN: 01P00A391800001\r\n'),
          peer: { address: '192.0.2.10', interface: 'test0', port: 2021 },
        },
        observedAt: '2026-09-14T00:00:00.000Z',
        expiresAt: '2026-09-14T00:00:30.000Z',
      }),
    ).toThrow('BAMBU_DISCOVERY_INVALID');
    expect(() =>
      parseBambuDiscoveryDatagram({
        datagram: {
          bytes: new Uint8Array(8193),
          peer: { address: '192.0.2.10', interface: 'test0', port: 2021 },
        },
        observedAt: '2026-09-14T00:00:00.000Z',
        expiresAt: '2026-09-14T00:00:30.000Z',
      }),
    ).toThrow('BAMBU_DISCOVERY_INVALID');
  });

  it('should preserve native physical units and map unknown states without retaining raw payload', () => {
    const status = parseBambuStatusPayload(
      bytes(
        '{"print":{"sequence_id":"7","printer_type":"BL-P001","nozzle_diameter":0.4,"nozzle_temper":215,"bed_temper":60,"gcode_state":"future-state","mc_percent":42,"mc_remaining_time":3,"materials":[{"material_id":"pla"}],"secret":"must-not-survive"}}',
      ),
    );
    expect(status).toMatchObject({
      runState: 'unknown',
      progress: 42,
      remainingSeconds: 180,
      model: 'X1C',
    });
    expect(status.nozzleDiameter).toMatchObject({
      value: 0.4,
      unit: { code: 'mm' },
      space: 'linear',
    });
    expect(status.nozzleTemperature).toMatchObject({
      value: 215,
      unit: { code: 'Cel' },
      space: 'point',
    });
    expect(status.materials).toEqual([{ slot: 0, state: 'loaded', materialId: 'pla' }]);
    expect(JSON.stringify(status)).not.toContain('must-not-survive');
    expect(() => parseBambuStatusPayload(new Uint8Array(262_145))).toThrow('BAMBU_STATUS_INVALID');
  });

  it('should preserve partial telemetry and distinguish loaded, empty, and unknown AMS slots', () => {
    /* eslint-disable @typescript-eslint/naming-convention, id-denylist -- Bambu wire field names are fixed. */
    const full = parseBambuStatusPayload(
      bytes(
        JSON.stringify({
          print: {
            sequence_id: '8',
            nozzle_diameter: '0.4',
            nozzle_temper: 25,
            nozzle_target_temper: 0,
            bed_temper: 24,
            bed_target_temper: 0,
            gcode_state: 'IDLE',
            layer_num: 12,
            total_layer_num: 120,
            subtask_name: 'Calibration cube',
            gcode_file: 'cube.gcode.3mf',
            spd_lvl: 2,
            spd_mag: 100,
            cooling_fan_speed: '15',
            big_fan1_speed: '6',
            big_fan2_speed: '0',
            wifi_signal: '-47dBm',
            sdcard: true,
            lights_report: [{ node: 'chamber_light', mode: 'on' }],
            print_error: 0,
            hms: [],
            ams: {
              tray_exist_bits: 'f',
              tray_now: '3',
              tray_tar: '3',
              ams: [
                {
                  humidity: '3',
                  temp: '22.5',
                  tray: [
                    {
                      tray_type: 'PETG',
                      tray_color: 'FFFFFFFF',
                      tray_sub_brands: 'Basic',
                      remain: 91,
                    },
                    { tray_type: 'PETG', tray_color: '000000FF', remain: 72 },
                    {},
                    { tray_type: 'PETG', tray_color: '00AE42FF', remain: 44 },
                  ],
                },
              ],
            },
          },
        }),
      ),
    );
    const merged = mergeBambuStatus(
      full,
      parseBambuStatusPayload(bytes('{"print":{"sequence_id":"9","nozzle_temper":26}}')),
    );
    /* eslint-enable @typescript-eslint/naming-convention, id-denylist -- Bambu wire field section ends. */

    expect(merged.materials).toEqual([
      {
        slot: 0,
        state: 'loaded',
        materialId: 'PETG',
        brand: 'Basic',
        color: '#FFFFFF',
        remainingPercent: 91,
      },
      {
        slot: 1,
        state: 'loaded',
        materialId: 'PETG',
        color: '#000000',
        remainingPercent: 72,
      },
      { slot: 2, state: 'empty' },
      {
        slot: 3,
        state: 'loaded',
        materialId: 'PETG',
        color: '#00AE42',
        remainingPercent: 44,
      },
    ]);
    expect(merged).toMatchObject({
      currentLayer: 12,
      totalLayers: 120,
      runName: 'Calibration cube',
      speedProfile: 'standard',
      speedPercent: 100,
      partFanPercent: 100,
      auxiliaryFanPercent: 40,
      chamberFanPercent: 0,
      wifiSignalDbm: -47,
      chamberLight: 'on',
      removableStorage: 'present',
      currentMaterialSlot: 3,
      targetMaterialSlot: 3,
    });
    expect(merged.materialUnits?.[0]).toMatchObject({
      unit: 0,
      humidityIndex: 3,
    });
    expect(merged.materialUnits?.[0]?.temperature).toMatchObject({
      value: 22.5,
    });
    expect(merged.nozzleDiameter).toMatchObject({ value: 0.4 });
    expect(merged.nozzleTemperature).toMatchObject({ value: 26 });
  });

  it('should correlate exact OTA firmware with the physical serial', () => {
    const version = parseBambuVersionPayload(
      bytes(
        '{"info":{"command":"get_version","sequence_id":"0","module":[{"name":"ota","project_name":"BL-P001","sw_ver":"01.08.02.00","hw_ver":"OTA","sn":"00M00A391800004"}],"result":"success"}}',
      ),
    );
    expect(version).toEqual({
      serial: '00M00A391800004',
      firmware: '01.08.02.00',
    });
    expect(() =>
      parseBambuVersionPayload(
        bytes(
          '{"info":{"command":"get_version","sequence_id":"other","module":[{"name":"ota","sw_ver":"01.08.02.00","sn":"00M00A391800004"}],"result":"success"}}',
        ),
      ),
    ).toThrow('BAMBU_VERSION_INVALID');
  });

  it('should require exact semantic correlation and reject topic, path, and still injection', () => {
    expect(
      parseBambuCommandPayload({
        bytes: bytes('{"print":{"command":"project_file","sequence_id":"9","result":"success","subtask_id":"run-1"}}'),
        command: 'project_file',
        sequence: '9',
      }),
    ).toEqual({ status: 'accepted', providerRunId: 'run-1' });
    expect(
      parseBambuCommandPayload({
        bytes: bytes('{"print":{"command":"project_file","sequence_id":"other","result":"success"}}'),
        command: 'project_file',
        sequence: '9',
      }),
    ).toEqual({ status: 'unrelated' });
    expect(() => bambuTopic('serial/#', 'request')).toThrow('BAMBU_IDENTIFIER_INVALID');
    expect(() => bambuRemoteName('bad\r\nDELE all')).toThrow('BAMBU_REMOTE_NAME_INVALID');
    expect(() => parseBambuStill(Uint8Array.from([0xff, 0xd8, 0, 0]), 'now')).toThrow('BAMBU_STILL_INVALID');
    expect(parseBambuStill(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), '2026-09-14T00:00:00.000Z')).toMatchObject({
      expiresAt: '2026-09-14T00:00:15.000Z',
    });
  });
});
