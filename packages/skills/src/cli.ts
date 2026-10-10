#!/usr/bin/env node
/**
 * `taucad-skills [directory] [owner...]` — copy Tau's CAD skill bundles into a skills directory.
 *
 * The one command the adoption contract promises. Without it a consumer has to
 * learn where each owning package keeps its bundle, which is the layout
 * knowledge the ESM contract exists to keep out of consumers.
 *
 * @module
 */
import { installSkills } from '#skill-bundles.js';

const [directory = '.agents/skills', ...owners] = process.argv.slice(2);
const slugs = await installSkills(directory, owners.length > 0 ? owners : undefined);
console.log(`Installed ${slugs.length} skill bundles into ${directory}: ${slugs.join(', ')}`);
