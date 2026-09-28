/** Exact frozen-corpus transport shared by the Node and browser MT qualification workers. */
/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-argument, typescript/no-unsafe-call, typescript/no-unsafe-return, typescript/no-unnecessary-condition -- The product binding and frozen JSON are runtime-validated dynamic inputs. */
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

const fromHex = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (part) => Number.parseInt(part, 16));

const invoke = (engine, record) => {
  const input = record.inputHex ? fromHex(record.inputHex) : encoder.encode(record.inputUtf8);
  switch (record.operation) {
    case 'ingestMesh': {
      return engine.ingestMesh(input, fromHex(record.meshHex));
    }
    case 'processRequest': {
      return engine.processRequest(input);
    }
    case 'canonicalPlan': {
      return engine.canonicalPlan(input);
    }
    case 'evaluatePlan': {
      return engine.evaluatePlan(input);
    }
    default: {
      throw new Error(`Unsupported MT qualification operation: ${record.operation}`);
    }
  }
};

/** Admit one frozen STEP subject, evaluate its one authored claim, and keep every exact response and work counter. */
const probeStep = (engine, row) => {
  const primary = fromHex(row.stepHex);
  const admissionUtf8 = decoder.decode(engine.ingestSubject(encoder.encode(row.ingestUtf8), primary, []));
  const { subjectHash } = JSON.parse(admissionUtf8).result.subject;
  const claim = JSON.parse(row.claimUtf8);
  claim.plan.subjects = claim.plan.subjects.map((subject) => ({ ...subject, subjectHash }));
  const canonicalUtf8 = decoder.decode(engine.processRequest(encoder.encode(JSON.stringify(claim))));
  return { admissionUtf8, canonicalUtf8, observationsUtf8: decoder.decode(engine.observations()) };
};

export const probeProduct = async ({ binding, execution, records, meshes, steps = [] }) => {
  await binding.initialize(undefined, execution);
  const meshById = new Map(meshes.map((mesh) => [mesh.id, mesh]));
  const results = [];
  let closed = 0;
  for (const record of records) {
    const engine = new binding.Engine(execution);
    try {
      const admissions = [];
      for (const id of record.ingest) {
        const mesh = meshById.get(id);
        if (!mesh) {
          throw new Error(`Missing frozen mesh ${id}`);
        }
        admissions.push(decoder.decode(engine.ingestMesh(encoder.encode(mesh.requestUtf8), fromHex(mesh.meshHex))));
      }
      try {
        const bytes = invoke(engine, record);
        results.push({ id: record.id, status: 'success', canonicalUtf8: decoder.decode(bytes), admissions });
      } catch (error) {
        if (typeof error?.code !== 'string' || typeof error?.message !== 'string') {
          throw error;
        }
        results.push({ id: record.id, status: 'refusal', code: error.code, message: error.message, admissions });
      }
    } finally {
      engine.close();
      closed += 1;
    }
  }
  for (const row of steps) {
    const engine = new binding.Engine(execution);
    try {
      results.push({ id: row.id, status: 'success', ...probeStep(engine, row) });
    } catch (error) {
      if (typeof error?.code !== 'string' || typeof error?.message !== 'string') {
        throw error;
      }
      results.push({ id: row.id, status: 'refusal', code: error.code, message: error.message });
    } finally {
      engine.close();
      closed += 1;
    }
  }
  return { results, closed };
};
