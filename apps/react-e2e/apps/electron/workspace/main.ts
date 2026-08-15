import { makeCylinder } from 'replicad';

export const defaultParams = {
  radius: 10,
  height: 24,
};

export default function main(params = defaultParams): ReturnType<typeof makeCylinder> {
  const { radius, height } = params;
  return makeCylinder(radius, height);
}
