#!/usr/bin/env node
/**
 * Doctor a tau-exported STEP artifact into the stale-selector fixture
 * (master acceptance case 3).
 *
 * Rewrites the stamped `geospec:facts` payload of the `mount` interface —
 * normal [0,1,0] → [1,0,0] and area → 1234.5 — while leaving the geometry
 * and SHAPE_ASPECT untouched, so the stamps disagree with observed geometry.
 * An honest exporter constructively cannot produce this artifact: SB2 stamps
 * facts from the very faces it just resolved.
 *
 * Usage: node doctor-stale.mjs <path-to-model.step>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) throw new Error('Usage: doctor-stale.mjs <model.step>');

const text = readFileSync(path, 'utf8');
const pattern = /DESCRIPTIVE_REPRESENTATION_ITEM\('mount','(\{[^']*\})'\)/;
const match = pattern.exec(text);
if (!match) throw new Error(`No stamped 'mount' geospec:facts payload found in ${path}`);

const facts = JSON.parse(match[1]);
facts.normal = [1, 0, 0];
facts.area = 1234.5;
// geospec:facts payloads are plain JSON (double quotes only) — safe inside a STEP string literal.
const doctored = text.replace(pattern, `DESCRIPTIVE_REPRESENTATION_ITEM('mount','${JSON.stringify(facts)}')`);
writeFileSync(path, doctored);
console.log(`Doctored 'mount' facts in ${path}`);
