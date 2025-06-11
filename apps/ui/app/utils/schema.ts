import { InputData, quicktype, jsonInputForTargetLanguage } from 'quicktype-core';

const jsonInput = jsonInputForTargetLanguage('json-schema');
const targetLanguage: Parameters<typeof quicktype>[0]['lang'] = 'json-schema';

export async function jsonSchemaFromJson(jsonString: string): Promise<unknown> {
  await jsonInput.addSource({
    name: 'schema',
    samples: [jsonString],
  });

  const inputData = new InputData();
  inputData.addInput(jsonInput);

  const serializedData = await quicktype({
    inputData,
    lang: targetLanguage,
  });

  const joinedSchema = serializedData.lines.join('');
  const parsedSchema = JSON.parse(joinedSchema) as unknown;
  console.log(parsedSchema);

  return parsedSchema;
}
