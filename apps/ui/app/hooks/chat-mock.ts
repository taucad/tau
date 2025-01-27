export const MOCK_CHAT_MESSAGES = [
  { content: 'Render gltf in React', role: 'user', status: 'success' },
  {
    role: 'assistant',
    content:
      "To render GLTF (GL Transmission Format) models in a React application, you can use the `@react-three/fiber` library along with `@react-three/drei`, which provides useful abstractions for working with 3D models. Below are the steps to set up a simple React component that renders a GLTF model.\n\n### Step 1: Install Required Packages\n\nFirst, you need to install the necessary packages. You can do this using npm or yarn:\n\n```bash\nnpm install three @react-three/fiber @react-three/drei\n```\n\nor\n\n```bash\nyarn add three @react-three/fiber @react-three/drei\n```\n\n### Step 2: Create a React Component\n\nNow, you can create a React component to load and render the GLTF model. Here's an example:\n\n```jsx\nimport React from 'react';\nimport { Canvas } from '@react-three/fiber';\nimport { OrbitControls, useGLTF } from '@react-three/drei';\n\nconst Model = ({ url }) => {\n  const { scene } = useGLTF(url);\n  return <primitive object={scene} />;\n};\n\nconst App = () => {\n  return (\n    <Canvas>\n      <ambientLight />\n      <pointLight position={[10, 10, 10]} />\n      <Model url=\"/path/to/your/model.gltf\" />\n      <OrbitControls />\n    </Canvas>\n  );\n};\n\nexport default App;\n```\n\n### Step 3: Add Your GLTF Model\n\nMake sure to replace `\"/path/to/your/model.gltf\"` with the actual path to your GLTF model file. You can place the model in the `public` directory of your React app for easy access.\n\n### Step 4: Run Your Application\n\nNow you can run your React application, and it should render the GLTF model in a 3D scene. You can use the mouse to rotate, zoom, and pan around the model thanks to the `OrbitControls`.\n\n### Additional Notes\n\n- Ensure that your GLTF model is properly formatted and accessible from the specified URL.\n- You can customize the lighting and camera settings in the `Canvas` component to better suit your model.\n- The `@react-three/drei` library provides many other useful components and hooks for working with 3D scenes, so feel free to explore its documentation for more features.\n\nThis setup should get you started with rendering GLTF models in a React application!",
    status: 'success',
  },
];

export const MOCK_KCL_MESSAGES = [
  {
    content: 'Generate a KittyCAD KCL file',
    role: 'user',
    status: 'success',
  },
  {
    role: 'assistant',
    content:
      'To generate a KittyCAD KCL (KittyCAD Language) file, I need to know the specific design or parameters you want to include in the file. Please provide details such as:\n\n1. The type of object or design you want to create (e.g., a simple shape, a complex model).\n2. Dimensions or specifications for the object.\n3. Any specific features or components you want to include (e.g., colors, textures, materials).\n\nOnce I have this information, I can help you create a KCL file.',
    status: 'success',
  },
  {
    content: 'I want a gear',
    role: 'user',
    status: 'success',
  },
  {
    role: 'assistant',
    content:
      "To create a KCL file for a gear, I need a few more details:\n\n1. **Number of Teeth**: How many teeth should the gear have?\n2. **Pitch Diameter**: What is the diameter of the pitch circle?\n3. **Module**: What is the module of the gear (this relates to the size of the teeth)?\n4. **Thickness**: How thick should the gear be?\n5. **Material**: What material should the gear be made of (if applicable)?\n6. **Color**: Do you want to specify a color for the gear?\n\nPlease provide these details, and I'll generate the KCL file for you.",
    status: 'success',
  },
  {
    content: 'Give an example, taking your best guess at each',
    role: 'user',
    status: 'success',
  },
  {
    role: 'assistant',
    content:
      'Here\'s an example of a gear with the following specifications:\n\n1. **Number of Teeth**: 20\n2. **Pitch Diameter**: 40 mm\n3. **Module**: 2 mm\n4. **Thickness**: 10 mm\n5. **Material**: Steel\n6. **Color**: Gray\n\nBased on these specifications, here is a sample KCL file for the gear:\n\n```kcl\n// Gear KCL File Example\n// Gear Specifications\ngear {\n    number_of_teeth: 20;\n    pitch_diameter: 40; // in mm\n    module: 2; // in mm\n    thickness: 10; // in mm\n    material: "Steel";\n    color: "Gray";\n}\n\n// Gear Geometry\ngeometry {\n    type: "cylinder";\n    radius: 20; // Pitch radius = Pitch Diameter / 2\n    height: 10; // Thickness\n}\n\n// Teeth Profile\nteeth {\n    profile: "involute";\n    depth: 2; // Depth of teeth\n    angle: 20; // Pressure angle\n}\n\n// End of Gear Definition\n```\n\nThis KCL file defines a gear with the specified parameters. You can modify any of the values as needed. If you would like to save this as a file or need further modifications, please let me know!',
    status: 'success',
  },
];
