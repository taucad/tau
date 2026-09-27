import { describe, expect, it } from 'vitest';

import { loadBambuHostLibraries } from '#bambu.host.js';

describe('Bambu host payload', () => {
  it('should load the reviewed MQTT and FTPS libraries only from the lazy host module', async () => {
    const libraries = await loadBambuHostLibraries();
    expect(libraries.mqttClient).toBeTypeOf('function');
    expect(libraries.ftpClient).toBeTypeOf('function');
  });
});
