import { makeCylinder } from 'replicad';

export const defaultParams = {
  radius: 10,
  height: 24,
};

export default function main(params = defaultParams) {
  const { radius, height } = params;
  return makeCylinder(radius, height);
}
