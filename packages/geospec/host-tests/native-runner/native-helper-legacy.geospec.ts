import { it } from 'geospec';
import { loadModel } from 'geospec/model';

it('requires explicit native runner mode', async () => {
  await loadModel({ source: 'baseline.step', format: 'step' });
});
