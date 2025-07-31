import { flatRoutes } from '@react-router/fs-routes';
import type { RouteConfigEntry } from '@react-router/dev/routes';

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- explicit module boundary required here.
export default flatRoutes() as Promise<RouteConfigEntry[]>;
