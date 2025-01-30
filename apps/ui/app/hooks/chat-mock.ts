export const MOCK_CHAT_MESSAGES = [
  { id: '1', content: 'Render gltf in React', role: 'user', status: 'success' },
  {
    id: '2',
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

export const MOCK_MATH_MESSAGES = [
  {
    content: 'Render Einsteins equations with math symbols, wrapping all symbols with a single dollar sign ($)',
    role: 'user',
    status: 'success',
  },
  {
    role: 'assistant',
    content:
      "Einstein's equations, particularly the famous equation from his theory of relativity, can be represented as follows:\n\n$$E = mc^2$$\n\nIn this equation:\n- $E$ represents energy,\n- $m$ represents mass,\n- $c$ represents the speed of light in a vacuum.\n\nIf you are referring to the field equations of general relativity, they can be expressed as:\n\n$$R_{\\mu\\nu} - \\frac{1}{2}g_{\\mu\\nu}R + g_{\\mu\\nu}\\Lambda = \\frac{8\\pi G}{c^4}T_{\\mu\\nu}$$\n\nWhere:\n- $R_{\\mu\\nu}$ is the Ricci curvature tensor,\n- $g_{\\mu\\nu}$ is the metric tensor,\n- $R$ is the scalar curvature,\n- $\\Lambda$ is the cosmological constant,\n- $G$ is the gravitational constant,\n- $c$ is the speed of light,\n- $T_{\\mu\\nu}$ is the stress-energy tensor.",
    status: 'success',
  },
];

export const MOCK_TOOL_MESSAGES = [
  {
    content: 'How does the sun produce energy? Search web',
    role: 'user',
    status: 'success',
  },
  {
    content:
      "The sun produces energy through a process called nuclear fusion, which occurs in its core. Here are some key points about how this process works:\n\n1. **Nuclear Fusion**: In the sun's core, hydrogen atoms are fused together to form helium nuclei. This fusion process releases a tremendous amount of energy, which is the source of the sun's light and heat.\n\n2. **Chain Reaction**: The energy released from nuclear fusion creates a chain reaction that allows the process to continue over and over again, sustaining the sun's energy output.\n\n3. **Energy Release**: The energy produced in the core eventually makes its way to the surface of the sun and is emitted as solar radiation, which is essential for life on Earth.\n\nFor more detailed information, you can check out the following resources:\n- [NASA Space Place: Where Does the Sun's Energy Come From?](https://spaceplace.nasa.gov/sun-heat/)\n- [Phys.org: How does the sun produce energy?](https://phys.org/news/2015-12-sun-energy.html)\n- [National Geographic Education: The Power of the Sun](https://education.nationalgeographic.org/resource/power-sun/)",
    role: 'assistant',
    status: 'success',
    toolCalls: [
      {
        description: 'Found 9 results',
        origin: 'web',
        description: 'Found 9 results',
        input: 'how does the sun produce energy',
        output: [
          {
            title: "Where Does the Sun's Energy Come From?",
            link: 'https://spaceplace.nasa.gov/sun-heat/',
            snippet:
              'This process—called nuclear fusion—releases energy while creating a chain reaction that allows it to occur over and over and over again. That energy builds up.',
          },
          {
            title: 'How does the sun produce energy?',
            link: 'https://phys.org/news/2015-12-sun-energy.html',
            snippet:
              '14 Dec 2015 — It is here, in the core, where energy is produced by hydrogen atoms (H) being converted into nuclei of helium (He).',
          },
          {
            title: 'The Power of the Sun - National Geographic Education',
            link: 'https://education.nationalgeographic.org/resource/power-sun/',
            snippet:
              '19 Oct 2023 — Solar energy is created by nuclear fusion that takes place in the sun. It is necessary for life on Earth, and can be harvested for human uses ...',
          },
          {
            title: 'How does solar power work? | Solar energy explained',
            link: 'https://www.nationalgrid.com/stories/energy-explained/how-does-solar-power-work',
            snippet:
              '16 May 2023 — Solar power works by converting energy from the sun into power. There are two forms of energy generated from the sun for our use – electricity and heat.',
          },
          {
            title: "The Sun's Energy: An Essential Part of the Earth System",
            link: 'https://scied.ucar.edu/learning-zone/earth-system/energy-from-sun',
            snippet:
              "Solar radiation, or energy produced by the Sun, is the primary energy source for most processes in the Earth system and drives Earth's energy budget.",
          },
          {
            title: 'How Does Solar Work?',
            link: 'https://www.energy.gov/eere/solar/how-does-solar-work',
            snippet:
              '3 Dec 2019 — Solar technologies convert sunlight into electrical energy either through photovoltaic (PV) panels or through mirrors that concentrate solar radiation.',
          },
          {
            title: 'Big Idea 3.2',
            link: 'https://science.nasa.gov/learn/heat/big-ideas/big-idea-3-2/',
            snippet:
              'The core is the central region where nuclear reactions consume hydrogen to form helium. These reactions release the energy that ultimately leaves the surface as ...',
          },
          {
            title: 'Why can the sun persistently produce energy for the stable ...',
            link: 'https://www.hko.gov.hk/en/education/space-weather/general/00418-why-can-the-sun-persistently-produce-energy-for-the-stable-output-of-light-and-heat.html',
            snippet:
              'The sun contains massive hydrogen that serves as a lasting supply of fuel for the generation of large amount of energy through persistent nuclear fusion.',
          },
          {
            title: 'How Does The Sun Produce Energy?',
            link: 'https://www.universetoday.com/75803/how-does-the-sun-produce-energy/',
            snippet:
              '12 Dec 2015 — The simple answer is that the Sun, like all stars, is able to create energy because it is essentially a massive fusion reaction. Scientists ...',
          },
        ],
      },
    ],
  },
];
