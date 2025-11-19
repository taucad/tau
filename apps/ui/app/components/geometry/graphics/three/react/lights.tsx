export function Lights(): React.JSX.Element {
  return (
    <>
      <ambientLight intensity={0.5} />
      <hemisphereLight args={['#ffffff', '#444444', 1]} />
      <directionalLight position={[-1, -3, 5]} color="white" intensity={2} />
      <directionalLight position={[1, 3, 5]} color="white" intensity={2} />
      <pointLight visible={false} position={[-1, -3, 3]} color="white" intensity={1} />
      <spotLight visible={false} position={[-1, -3, 4]} color="white" intensity={1} />
    </>
  );
}
