// Example of colored shapes in OpenSCAD
module colored_cubes() {
    color("red") 
        translate([0, 0, 0]) 
            cube([10, 10, 10]);
    
    color("green") 
        translate([15, 0, 0]) 
            cube([10, 10, 10]);
    
    color("blue") 
        translate([30, 0, 0]) 
            cube([10, 10, 10]);
    
    color("yellow") 
        translate([0, 15, 0]) 
            cube([10, 10, 10]);
}

colored_cubes(); 
