import { describe, expect, it } from 'vitest';

import {
  bambuRemoteName,
  bambuStage,
  bambuTopic,
  mergeBambuStatus,
  parseBambuCommandPayload,
  parseBambuDiscoveryDatagram,
  parseBambuStatusPayload,
  parseBambuStill,
  parseBambuVersionPayload,
} from '#bambu.protocol.js';

const bytes = (value: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(value);
/** Parse one status report whose `print` object carries only the given fields. */
const report = (print: Readonly<Record<string, unknown>>) =>
  // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field name.
  parseBambuStatusPayload(bytes(JSON.stringify({ print: { sequence_id: '1', ...print } })));

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

  it('should discover an A1 mini without admitting another model or a mismatched serial', () => {
    const discover = (model: string, serial: string) =>
      parseBambuDiscoveryDatagram({
        datagram: {
          bytes: bytes(
            `NOTIFY * HTTP/1.1\r\nDevName.bambu.com: Mini\r\nDevModel.bambu.com: ${model}\r\nUSN: ${serial}\r\n`,
          ),
          peer: { address: '192.0.2.145', interface: 'test0', port: 2021 },
        },
        observedAt: '2026-09-30T00:00:00.000Z',
        expiresAt: '2026-09-30T00:00:30.000Z',
      });
    expect(discover('N1', '0300EA652800550')).toMatchObject({
      name: 'Mini',
      claimedIdentity: { model: 'A1 mini', serial: '0300EA652800550' },
    });
    expect(() => discover('N1', '00M00A391800004')).toThrow('BAMBU_DISCOVERY_INVALID');
    expect(() => discover('C12', '01P00A391800001')).toThrow('BAMBU_DISCOVERY_INVALID');
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
                      tray_info_idx: 'GFG00',
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
        profileId: 'GFG00',
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

  /* eslint-disable @typescript-eslint/naming-convention -- Bambu wire field names are fixed. */
  it('should read the external spool from vt_tray as tray 254, apart from the AMS trays', () => {
    const status = report({
      ams: { tray_now: '254', tray_tar: '254', ams: [{ tray: [{ tray_type: 'PLA', tray_color: '000000FF' }] }] },
      vt_tray: {
        id: '254',
        tray_type: 'PETG',
        tray_color: 'FFFFFFFF',
        tray_info_idx: 'GFG99',
        tray_sub_brands: '',
        remain: 0,
      },
    });

    expect(status.externalMaterial).toEqual({
      slot: 254,
      state: 'loaded',
      materialId: 'PETG',
      profileId: 'GFG99',
      color: '#FFFFFF',
    });
    expect(status.materials?.map(({ slot }) => slot)).toEqual([0, 1, 2, 3]);
    expect(status).toMatchObject({ currentMaterialSlot: 254, targetMaterialSlot: 254 });
  });

  it('should read an unset external holder as empty and the P2S vir_slot list as the external spool', () => {
    expect(report({ vt_tray: { id: '254', tray_type: '', tray_color: '00000000' } }).externalMaterial).toEqual({
      slot: 254,
      state: 'empty',
    });
    expect(
      report({ vir_slot: [{ id: '254', tray_type: 'PETG', tray_color: 'FFFFFFFF' }] }).externalMaterial,
    ).toMatchObject({ slot: 254, state: 'loaded', materialId: 'PETG', color: '#FFFFFF' });
    expect(report({ nozzle_temper: 20 }).externalMaterial).toBeUndefined();
  });

  it('should read tray 255 as nothing feeding and drop tray ids no printer reports', () => {
    expect(report({ ams: { tray_now: '255', tray_tar: 255 } })).not.toHaveProperty('currentMaterialSlot');
    expect(report({ ams: { tray_now: '255', tray_tar: 255 } })).not.toHaveProperty('targetMaterialSlot');
    expect(report({ ams: { tray_now: '16' } })).not.toHaveProperty('currentMaterialSlot');
    expect(report({ ams: { tray_now: '15' } })).toMatchObject({ currentMaterialSlot: 15 });
  });

  it('should keep the external spool when a later report carries only the AMS, and the AMS when it carries only vt_tray', () => {
    const external = report({ vt_tray: { id: '254', tray_type: 'PETG', tray_color: 'FFFFFFFF' } });
    const both = mergeBambuStatus(external, report({ ams: { ams: [{ tray: [{ tray_type: 'PLA' }] }] } }));
    const again = mergeBambuStatus(both, report({ vt_tray: { id: '254', tray_type: 'PETG', tray_color: 'FFFFFFFF' } }));

    expect(again.externalMaterial).toMatchObject({ slot: 254, materialId: 'PETG' });
    expect(again.materials?.[0]).toMatchObject({ slot: 0, materialId: 'PLA' });
  });
  /* eslint-enable @typescript-eslint/naming-convention -- Bambu wire field section ends. */

  it('should correlate exact OTA firmware with the physical serial', () => {
    const version = parseBambuVersionPayload(
      bytes(
        '{"info":{"command":"get_version","sequence_id":"0","module":[{"name":"ota","project_name":"BL-P001","sw_ver":"01.08.02.00","hw_ver":"OTA","sn":"00M00A391800004"}],"result":"success"}}',
      ),
    );
    expect(version).toEqual({
      serial: '00M00A391800004',
      firmware: '01.08.02.00',
      model: 'X1C',
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
    // Firmware may echo the sequence id as a number.
    expect(
      parseBambuCommandPayload({
        bytes: bytes('{"print":{"command":"project_file","sequence_id":9,"result":"SUCCESS"}}'),
        command: 'project_file',
        sequence: '9',
      }),
    ).toEqual({ status: 'accepted' });
    expect(() => bambuTopic('serial/#', 'request')).toThrow('BAMBU_IDENTIFIER_INVALID');
    expect(() => bambuRemoteName('bad\r\nDELE all')).toThrow('BAMBU_REMOTE_NAME_INVALID');
    expect(() => parseBambuStill(Uint8Array.from([0xff, 0xd8, 0, 0]), 'now')).toThrow('BAMBU_STILL_INVALID');
    expect(parseBambuStill(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]), '2026-09-14T00:00:00.000Z')).toMatchObject({
      expiresAt: '2026-09-14T00:00:15.000Z',
    });
  });
});

describe('Bambu printer diagnostics', () => {
  const helpPage = 'https://wiki.bambulab.com/en/x1/troubleshooting/hmscode/';

  it('should decode an HMS row into its display code, severity, readable message and help page', () => {
    expect(report({ hms: [{ attr: 201_327_360, code: 196_619 }] }).alerts).toEqual([
      {
        code: '0C00-0300-0003-000B',
        severity: 'warning',
        message: "The printer's camera and AI inspection raised a warning.",
        reference: `${helpPage}0C00_0300_0003_000B`,
      },
    ]);
  });

  it.each([
    [1, 'fatal', 'reported a fatal error'],
    [2, 'serious', 'reported a serious error'],
    [3, 'warning', 'raised a warning'],
    [4, 'info', 'sent a notice'],
  ] as const)('should read severity level %i as %s', (level, severity, outcome) => {
    expect(report({ hms: [{ attr: 0x08_00_01_00, code: level * 2 ** 16 + 1 }] }).alerts).toEqual([
      {
        code: `0800-0100-000${level}-0001`,
        severity,
        message: `The printer's toolhead ${outcome}.`,
        reference: `${helpPage}0800_0100_000${level}_0001`,
      },
    ]);
  });

  it('should name neither a module nor a severity it does not know', () => {
    expect(report({ hms: [{ attr: 0x10_00_01_00, code: 0x00_05_00_01 }] }).alerts).toEqual([
      {
        code: '1000-0100-0005-0001',
        message: 'The printer reported a problem.',
        reference: `${helpPage}1000_0100_0005_0001`,
      },
    ]);
  });

  it('should link an AMS diagnostic to the help page written for its first unit and slot', () => {
    // AMS unit 4 (low bits of the first word), slot 4 (bits 8–10 of the second): the help centre folds both.
    expect(report({ hms: [{ attr: 0x07_03_23_00, code: 0x00_02_00_01 }] }).alerts).toEqual([
      {
        code: '0703-2300-0002-0001',
        severity: 'serious',
        message: "The printer's AMS reported a serious error.",
        reference: `${helpPage}0700_2000_0002_0001`,
      },
    ]);
  });

  it('should decode a print error into its two-word code without inventing a severity or a help page', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field name.
    expect(report({ print_error: 50_348_044 }).alerts).toEqual([
      { code: '0300-400C', message: "The printer's motion controller reported a print error." },
    ]);
  });

  it.each([0x05_00_40_2f, String(0x05_00_40_2f)])(
    'should explain the reported microSD sector failure (%s)',
    (value) => {
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field name.
      expect(report({ print_error: value }).alerts).toEqual([
        {
          code: '0500-402F',
          message:
            'The microSD card has damaged sector data. Back up readable files, then repair or format the card. Replace it if the printer still cannot read it.',
        },
      ]);
    },
  );

  it('should accept the integers as decimal strings', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field name.
    expect(report({ print_error: '50348044', hms: [{ attr: '201327360', code: '196619' }] }).alerts).toMatchObject([
      { code: '0300-400C' },
      { code: '0C00-0300-0003-000B', severity: 'warning' },
    ]);
  });

  it('should ignore malformed and repeated rows instead of failing the report', () => {
    const status = report({
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field name.
      print_error: 'not-a-number',
      hms: [
        null,
        'row',
        [201_327_360, 196_619],
        { attr: 201_327_360 },
        { attr: '0C000300', code: 196_619 },
        { attr: -1, code: 196_619 },
        { attr: 201_327_360.5, code: 196_619 },
        { attr: 2 ** 32, code: 196_619 },
        { attr: 0, code: 196_619 },
        { attr: 201_327_360, code: 196_619 },
        { attr: '201327360', code: 196_619 },
      ],
    });
    expect(status.alerts).toEqual([expect.objectContaining({ code: '0C00-0300-0003-000B' })]);
  });

  it('should clear earlier alerts when a report carries none', () => {
    const raised = report({ hms: [{ attr: 201_327_360, code: 196_619 }] });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field name.
    expect(mergeBambuStatus(raised, report({ print_error: 0, hms: [] })).alerts).toEqual([]);
  });
});

describe('Bambu printer stage', () => {
  it('should read a known stage id as a phrase, from a number or a decimal string', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field name.
    expect(bambuStage(report({ stg_cur: 2 }).stageId)).toBe('Heating the bed');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field name.
    expect(bambuStage(report({ stg_cur: '1' }).stageId)).toBe('Levelling the bed');
  });

  it.each([
    ['normal printing', 0],
    ['idle on the X1', -1],
    ['idle on the P1', 255],
    ['an id this table does not know', 78],
  ])('should give no phrase for %s', (_name, id) => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field name.
    expect(bambuStage(report({ stg_cur: id }).stageId)).toBeUndefined();
  });

  it('should replace an earlier stage and never read the bare print stage number or a malformed id', () => {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field name.
    const heating = report({ stg_cur: 2 });
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field names.
    expect(bambuStage(mergeBambuStatus(heating, report({ stg_cur: -1, mc_print_stage: '2' })).stageId)).toBeUndefined();
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field names.
    expect(report({ mc_print_stage: '2', gcode_state: 'RUNNING' })).not.toHaveProperty('stageId');
    // eslint-disable-next-line @typescript-eslint/naming-convention -- Bambu wire field names.
    expect(report({ stg_cur: 'heating', gcode_state: 'RUNNING' })).not.toHaveProperty('stageId');
  });
});
