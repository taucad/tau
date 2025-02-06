import { ReplicadProvider } from './geometry/replicad/context';
import { ReplicadStudio } from './geometry/replicad/replicad-studio';

export function ChatViewer() {
  return (
    <ReplicadProvider>
      <ReplicadStudio />
    </ReplicadProvider>
  );
}
