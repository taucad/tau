import { useRef, useState } from 'react'
import { Canvas, useFrame, MeshProps } from '@react-three/fiber'

function Box(properties: any) {
    // This reference gives us direct access to the THREE.Mesh object
    const reference = useRef<MeshProps>(null)
    // Hold state for hovered and clicked events
    const [hovered, hover] = useState(false)
    const [clicked, click] = useState(false)
    // Subscribe this component to the render-loop, rotate the mesh every frame
    // useFrame((state, delta) => {
    //     if (ref.current) {
    //         ref.current.rotation.x += delta;
    //     }
    // })
    // Return the view, these are regular Threejs elements expressed in JSX
    return (
        <mesh
            {...properties}
            ref={reference}
            rotation={[0, 45, 0]}
            scale={clicked ? 1.5 : 1}
            onClick={(event) => click(!clicked)}
            onPointerOver={(event) => hover(true)}
            onPointerOut={(event) => hover(false)}>
            <boxGeometry args={[1, 1, 1]} />
            {/* @ts-expect-error - color is incorrectly typed */}
            <meshStandardMaterial color={hovered ? 'hotpink' : 'orange'} />
        </mesh>
    )
}

export default function Viewer() {
    return <Canvas>
        <ambientLight intensity={Math.PI / 2} />
        <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} decay={0} intensity={Math.PI} />
        <pointLight position={[-10, -10, -10]} decay={0} intensity={Math.PI} />
        <Box position={[0, 1, 0]} />
        <Box position={[0, -1, 0]} />
    </Canvas>;
}
