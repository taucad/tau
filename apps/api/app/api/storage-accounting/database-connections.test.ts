import { describe, expect, it } from 'vitest';
import { databaseConnectionFigures } from '#api/storage-accounting/database-connections.js';

describe('databaseConnectionFigures (W14 OB3, N48–N49)', () => {
  const figures = databaseConnectionFigures(
    [
      { applicationName: 'tau-api', state: 'active', connections: 3 },
      { applicationName: 'tau-api', state: 'idle', connections: 7 },
      {
        applicationName: 'tau-mirror',
        state: 'idle in transaction',
        connections: 1,
      },
      {
        applicationName: 'tau-mirror',
        state: 'idle in transaction (aborted)',
        connections: 1,
      },
      { applicationName: 'psql', state: 'active', connections: 2 },
      { applicationName: '', state: '', connections: 4 },
      {
        applicationName: 'tau-boundary-run-1',
        state: 'fastpath function call',
        connections: 1,
      },
    ],
    97,
  );
  const value = (application: string, state: string): number | undefined =>
    figures.databaseConnections?.find(
      (observation) =>
        observation.attributes['tau.db.application'] === application && observation.attributes.state === state,
    )?.value;

  it('should map each application_name Tau sets to its process, and any other to `other`', () => {
    expect(value('api', 'active')).toBe(3);
    expect(value('api', 'idle')).toBe(7);
    expect(value('other', 'active')).toBe(2);
    expect(JSON.stringify(figures)).not.toContain('psql');
    expect(JSON.stringify(figures)).not.toContain('tau-boundary');
  });

  it('should fold both idle-in-transaction states together and an unseen state into `other`', () => {
    expect(value('mirror', 'idle_in_transaction')).toBe(2);
    expect(value('other', 'other')).toBe(5);
  });

  it('should export every application and state, zero when absent', () => {
    expect(figures.databaseConnections).toHaveLength(24);
    expect(value('release', 'active')).toBe(0);
  });

  it('should export the connection budget as one series', () => {
    expect(figures.databaseConnectionBudget).toStrictEqual([{ value: 97, attributes: {} }]);
  });
});
