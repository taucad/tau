import { BuerliCadFacade } from '@buerli.io/classcad';

export const defaultParams = {
  width: 50,
  depth: 30,
  height: 10,
  holeRadius: 5,
  holeDepth: 8,
};

export default async function main(p = defaultParams) {
  const bcf = new BuerliCadFacade();
  await bcf.connect();
  const api = bcf.api.v1;

  const part = await api.part.create({ name: 'Flange' });

  await api.part.box({
    id: part,
    width: p.width,
    depth: p.depth,
    height: p.height,
  });

  await api.part.cylinder({
    id: part,
    axes: [],
    radius: p.holeRadius,
    height: p.holeDepth,
  });

  const geoms = await bcf.createBufferGeometry(part);
  return geoms;
}
