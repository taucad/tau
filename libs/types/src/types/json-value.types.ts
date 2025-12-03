/**
A JSON value can be a string, number, boolean, object, array, or null.
JSON values can be serialized and deserialized by the JSON.stringify and JSON.parse methods.
 */
// eslint-disable-next-line @typescript-eslint/naming-convention, @typescript-eslint/no-restricted-types -- JSON value type
export type JSONValue = null | string | number | boolean | JSONObject | JSONArray;

// eslint-disable-next-line @typescript-eslint/naming-convention -- JSON object type
export type JSONObject = {
  [key: string]: JSONValue;
};

// eslint-disable-next-line @typescript-eslint/naming-convention -- JSON array type
export type JSONArray = JSONValue[];
