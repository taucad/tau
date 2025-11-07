import { useBuild } from '#hooks/use-build.js';
import { GitConnector } from '#components/git/git-connector.js';

export function BuildGitConnector(): React.ReactNode {
  const { gitRef } = useBuild();

  return <GitConnector gitRef={gitRef} className="hidden md:flex" />;
}
