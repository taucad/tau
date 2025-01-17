import { Canvas, MeshProps } from '@react-three/fiber'
import { useGLTF, OrbitControls } from '@react-three/drei'

const MODELS = {
    Beech: 'https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/tree-beech/model.gltf',
    Lime: 'https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/tree-lime/model.gltf',
    Spruce: 'https://vazxmixjsiawhamofees.supabase.co/storage/v1/object/public/models/tree-spruce/model.gltf',
    Camera: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/refs/heads/main/2.0/AntiqueCamera/glTF/AntiqueCamera.gltf'
}

const Model = ({ url, ...properties }: { url: string } & MeshProps) => {
    const { scene } = useGLTF(url);
    return <primitive object={scene} {...properties} />;
};

export default function Viewer() {
    // useDeferredValue allows us to defer updates, the component is market by React
    // so that it does *not* run into the fallback when something new loads
    // const deferred = useDeferredValue(MODELS.Beech)
    // We can find out the loading state by comparing the current value with the deferred value
    // const isLoading = url !== deferred
    // const { scene } = useGLTF(deferred)

    return <Canvas camera={{ position: [-10, 20, 40], fov: 10 }}>
        <ambientLight intensity={Math.PI / 2} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
        <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
        <Model url={MODELS.Camera} position={[0, -5, 0]} rotation={[0.1, -5.7, 0]} />

        <OrbitControls />
    </Canvas>;
}
