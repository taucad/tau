import { Canvas, MeshProps } from '@react-three/fiber';
import { useGLTF, OrbitControls } from '@react-three/drei';
import ReplicadApp from './geometry/replicad/sample-replicad';

const MODELS = {
  Beech: 'https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/tree-beech/model.gltf',
  Lime: 'https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/tree-lime/model.gltf',
  Spruce: 'https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/tree-spruce/model.gltf',
  Camera:
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/refs/heads/main/2.0/AntiqueCamera/glTF/AntiqueCamera.gltf',
  CarWheel: '/car-wheel.gltf',
};

const Model = ({ url, ...properties }: { url: string } & MeshProps) => {
  const { scene } = useGLTF(url);
  return <primitive object={scene} {...properties} />;
};

export function ChatViewer() {
  // useDeferredValue allows us to defer updates, the component is market by React
  // so that it does *not* run into the fallback when something new loads
  // const deferred = useDeferredValue(MODELS.Beech)
  // We can find out the loading state by comparing the current value with the deferred value
  // const isLoading = url !== deferred
  // const { scene } = useGLTF(deferred)

  return (
    <ReplicadApp />
    // <iframe
    //   allow="fullscreen"
    //   className="w-full h-full"
    //   src="https://studio.replicad.xyz/share/https%3A%2F%2Fraw.githubusercontent.com%2Fsgenoud%2Freplicad%2Fmain%2Fpackages%2Freplicad-docs%2Fexamples%2FsimpleVase.js"
    // ></iframe>
    // <Canvas camera={{ position: [0, 0, 20], fov: 2 }}>
    //   <ambientLight intensity={Math.PI / 2} />
    //   <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
    //   <pointLight position={[-10, -10, -10]} decay={0} intensity={2 * Math.PI} />
    //   <Model url={MODELS.CarWheel} position={[0, 0, 0]} rotation={[0.3, -5.7, 0]} />

    //   <OrbitControls />
    // </Canvas>
  );
}
