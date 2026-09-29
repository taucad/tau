import { expectNativeGeo, it } from 'geospec';

it('requires explicit native runner mode', () => {
  void expectNativeGeo({
    subjectHash: '0000000000000000000000000000000000000000000000000000000000000000',
  }).toBeWatertight();
});
