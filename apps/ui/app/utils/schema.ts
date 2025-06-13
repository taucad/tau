import { InputData, quicktype, jsonInputForTargetLanguage } from 'quicktype-core';

const targetLanguage: Parameters<typeof quicktype>[0]['lang'] = 'json-schema';

/**
 * Takes a JSON object and returns it's equivalent JSON Schema.
 * @param json - The JSON object to convert to a JSON Schema.
 * @returns The JSON Schema.
 */
export async function jsonSchemaFromJson(json: Record<string, unknown>): Promise<unknown> {
  const jsonInput = jsonInputForTargetLanguage('json-schema');
  await jsonInput.addSource({
    name: 'schema',
    samples: [JSON.stringify(json)],
  });

  const inputData = new InputData();
  inputData.addInput(jsonInput);

  const serializedData = await quicktype({
    inputData,
    lang: targetLanguage,
  });

  const joinedSchema = serializedData.lines.join('');
  const parsedSchema = JSON.parse(joinedSchema) as unknown;

  return parsedSchema;
}
