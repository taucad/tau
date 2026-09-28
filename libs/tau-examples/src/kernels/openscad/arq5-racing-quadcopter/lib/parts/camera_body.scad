$fa = 2;
$fs = 0.4;

module camera_body() {
  color("#111111")
    scale([16 / 19, 1, 1])
      sphere(d = 19);
}

camera_body();
