// POV-Ray file generated from Rhinoceros.

camera {
   orthographic
   location <0, 2.50502, -1>
   //look_at <0, 0, -1>
   right <5.86667, 0, -0>
   up <0, 0, 4.4>
   direction <0, -1, 0>
   /*
   // to get an image that's the same as the viewport in Rhino,
   // uncomment this section and render with command line options (alt+c):
   // +w2 +h2
   right <5.97109, 0, -0>
   up <0, 0, 4.4>
   direction <0, -1, 0>
   */
}


background { color rgb <1, 1, 1> }
global_settings { ambient_light color rgb <0, 0, 0> }


// default light
light_source { <-2.50502, 7.51507, 1.50502> color rgb <1,1,1> }


// node  (Object1)
#declare rh_color = <1, 1, 1, 0>;
#declare rh_layercolor = <0, 0, 0>;
#declare rh_phong = 0;
#declare rh_phong_size = 0;
#declare rh_image_map = "/Applications/Rhino 8.app/Contents/PlugIns/default.png"
#declare rh_bump_map = "/Applications/Rhino 8.app/Contents/PlugIns/default.png"
#include "/Applications/Rhino 8.app/Contents/PlugIns/materials.inc"
#declare Object1Material = "DefaultMaterial"
#declare Object1 = object {
   #include "cube1.inc"
}
object { Object1 material { Object1Material }}


