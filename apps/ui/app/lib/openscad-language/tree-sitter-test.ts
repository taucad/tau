/**
 * Test and demonstration of tree-sitter OpenSCAD parsing integration
 * This file shows how to use the enhanced parsing capabilities
 */

import { 
  checkTreeSitterAvailability, 
  analyzeOpenSCADCode 
} from './openscad-utils-enhanced.js';

// Test OpenSCAD code samples
const testCases = [
  {
    name: 'Simple Module',
    code: `
      // A simple parametric box module
      module box(width = 10, height = 5, depth = 3) {
        cube([width, height, depth]);
      }
      
      // Create a box instance
      box(15, 8, 4);
    `
  },
  {
    name: 'Function Definition',
    code: `
      // Calculate circle area
      function circle_area(radius) = PI * radius * radius;
      
      // Test variables
      radius = 5;
      area = circle_area(radius);
    `
  },
  {
    name: 'Complex Example',
    code: `
      // Parametric gear module
      module gear(teeth = 20, thickness = 5, hole_diameter = 5) {
        difference() {
          union() {
            cylinder(r = teeth * 0.5, h = thickness, center = true);
            for (i = [0:teeth-1]) {
              rotate([0, 0, i * 360 / teeth])
                translate([teeth * 0.5, 0, 0])
                  cube([2, 2, thickness], center = true);
            }
          }
          // Center hole
          cylinder(r = hole_diameter / 2, h = thickness + 1, center = true);
        }
      }
      
      // Create gear assembly
      translate([0, 0, 0]) gear(15, 3, 2);
      translate([20, 0, 0]) rotate([0, 0, 12]) gear(10, 3, 2);
    `
  }
];

/**
 * Test the tree-sitter parsing integration
 */
export async function testTreeSitterParsing(): Promise<void> {
  console.log('🧪 Testing OpenSCAD Tree-sitter Integration');
  console.log('==========================================');
  
  // Check if tree-sitter is available
  const availability = await checkTreeSitterAvailability();
  console.log(`\n📊 Tree-sitter Status: ${availability.available ? '✅ Available' : '❌ Not Available'}`);
  console.log(`   Message: ${availability.message}`);
  
  // Test each code sample
  for (const testCase of testCases) {
    console.log(`\n🔍 Testing: ${testCase.name}`);
    console.log('─'.repeat(40));
    
    try {
      const result = await analyzeOpenSCADCode(testCase.code);
      
      console.log(`   Parse Method: ${result.parseMethod}`);
      console.log(`   Success: ${result.success}`);
      console.log(`   Errors: ${result.errors.length}`);
      
      if (result.errors.length > 0) {
        console.log('   Error Details:');
        result.errors.forEach((error, index) => {
          console.log(`     ${index + 1}. ${error.message} (line ${error.line})`);
        });
      }
      
      console.log(`   Variables found: ${result.variables.length}`);
      result.variables.forEach((variable, index) => {
        console.log(`     ${index + 1}. ${variable.name} = ${variable.value} (${variable.type})`);
      });
      
      console.log(`   Modules found: ${result.modules.length}`);
      result.modules.forEach((module, index) => {
        console.log(`     ${index + 1}. ${module.name}(${module.parameters.join(', ')})`);
      });
      
      console.log(`   Functions found: ${result.functions.length}`);
      result.functions.forEach((func, index) => {
        console.log(`     ${index + 1}. ${func.name}(${func.parameters.join(', ')})`);
      });
      
    } catch (error) {
      console.error(`   ❌ Error parsing ${testCase.name}:`, error);
    }
  }
  
  console.log('\n🎉 Test completed!');
}

/**
 * Test specific parsing features
 */
export async function testSpecificFeatures(): Promise<void> {
  console.log('\n🔬 Testing Specific Features');
  console.log('============================');
  
  // Test variable detection
  const variableCode = `
    // Test variables
    width = 10;
    height = 15;
    depth = 5;
    center = true;
    name = "test_part";
    points = [[0,0], [10,0], [10,10], [0,10]];
  `;
  
  console.log('\n📝 Variable Detection Test');
  const varResult = await analyzeOpenSCADCode(variableCode);
  console.log(`   Found ${varResult.variables.length} variables:`);
  varResult.variables.forEach(v => {
    console.log(`     - ${v.name}: ${v.type} = ${v.value}`);
  });
  
  // Test module detection
  const moduleCode = `
    // Test modules
    module simple_box() {
      cube(10);
    }
    
    module parametric_box(w = 10, h = 5, d = 3) {
      cube([w, h, d]);
    }
    
    module complex_module(size, center = false, $fn = 20) {
      if (center) {
        translate([-size/2, -size/2, 0])
          cylinder(r = size/2, h = size, $fn = $fn);
      } else {
        cylinder(r = size/2, h = size, $fn = $fn);
      }
    }
  `;
  
  console.log('\n🏗️ Module Detection Test');
  const modResult = await analyzeOpenSCADCode(moduleCode);
  console.log(`   Found ${modResult.modules.length} modules:`);
  modResult.modules.forEach(m => {
    console.log(`     - ${m.signature}`);
  });
  
  // Test function detection
  const functionCode = `
    // Test functions
    function add(a, b) = a + b;
    function multiply(x, y) = x * y;
    function circle_area(radius) = PI * radius * radius;
    
    function complex_calculation(
      input_value,
      multiplier = 2,
      offset = 0
    ) = (input_value * multiplier) + offset;
  `;
  
  console.log('\n⚙️ Function Detection Test');
  const funcResult = await analyzeOpenSCADCode(functionCode);
  console.log(`   Found ${funcResult.functions.length} functions:`);
  funcResult.functions.forEach(f => {
    console.log(`     - ${f.signature}`);
  });
}

// Export the test functions for use in the browser console
if (typeof window !== 'undefined') {
  (window as any).testTreeSitterParsing = testTreeSitterParsing;
  (window as any).testSpecificFeatures = testSpecificFeatures;
  
  console.log(`
🌲 Tree-sitter OpenSCAD Integration Loaded!

Test the integration in the browser console:
- await testTreeSitterParsing()
- await testSpecificFeatures()
  `);
}