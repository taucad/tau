export const mockCode = `// Car Wheel Assembly
// A car wheel assembly with a rotor, tire, and lug nuts.

import carRotor from 'car-rotor.kcl'
import carTire from 'car-tire.kcl'
import carWheel from 'car-wheel.kcl'
import lugNut from 'lug-nut.kcl'
import brakeCaliper from 'brake-caliper.kcl'
import lugCount from 'globals.kcl'

carRotor()
carTire()
carWheel()
lugNut()
  |> patternCircular3d({
     arcDegrees = 360,
     axis = [0, 1, 0],
     center = [0, 0, 0],
     instances = lugCount,
     rotateDuplicates = false
   }, %)
brakeCaliper()
`;
