// Upstream's test runner uses node:assert/strict; Tau's portable tests also run in Chromium.
import { it } from 'vitest';
import { createTelemetryAdapterConformance } from '@earendil-works/pi-telemetry/testing';
import { telemetryFixture } from '#telemetry.test-fixture.js';

for (const test of createTelemetryAdapterConformance(async () => telemetryFixture())) {
  it(`should satisfy Pi ${test.group}: ${test.name}`, async () => test.run());
}
