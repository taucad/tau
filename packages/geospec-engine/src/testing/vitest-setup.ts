/** Unit suites are cache-cold unless they install their own evidence store. */
import { setGeoSpecEvidenceStore } from '#cache/evidence-cache.js';

setGeoSpecEvidenceStore(undefined);
