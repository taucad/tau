// Beautiful, aesthetically pleasing fluted and twisted vase
// Height: 20cm (200mm)
// Single-polyhedron seamless design with rounded rim

// Adaptive tessellation parameters
$fa = 2;
$fs = 0.4;

// Design parameters
height = 200;
wall_thickness = 3.0;
bottom_thickness = 6.0;
flutes = 7;
twist = 90; // degrees

// Mesh resolution parameters
M_out = 80;  // outer wall slices
M_rim = 12;  // rounded rim slices
M_in = 80;   // inner wall slices
Na = 120;    // points per slice

// Bezier 1D helper function for base radius curve
function bezier1d(p0, p1, p2, p3, u) = 
    pow(1-u, 3) * p0 + 
    3 * pow(1-u, 2) * u * p1 + 
    3 * (1-u) * pow(u, 2) * p2 + 
    pow(u, 3) * p3;

// Base radius curve: classic amphora profile
function r_base_func(u) = bezier1d(35, 110, -10, 45, u);

function clamp(v, mn, mx) = max(mn, min(mx, v));

module elegant_vase() {
    r_rim = wall_thickness / 2;
    K = M_out + M_rim + M_in;
    
    // Generate all vertices
    vertices = concat(
        [
            for (k = [0 : K])
            let (
                // Retrieve parametric values for slice k
                params = (k <= M_out) ? (
                    // 1. Outer wall
                    let (
                        u = k / M_out,
                        z = u * (height - r_rim),
                        u_outer = z / height,
                        r_base = r_base_func(u_outer),
                        amp = r_base * 0.12,
                        twist_angle = u_outer * twist
                    ) [r_base, amp, twist_angle, z]
                ) : (
                    (k <= M_out + M_rim) ? (
                        // 2. Rounded Rim
                        let (
                            u_rim = (k - M_out) / M_rim,
                            alpha = u_rim * 180,
                            z = (height - r_rim) + r_rim * sin(alpha),
                            u_outer = clamp(z / height, 0, 1),
                            R_mid = r_base_func(u_outer) - r_rim,
                            r_base = R_mid + r_rim * cos(alpha),
                            amp = r_base * 0.12,
                            twist_angle = u_outer * twist
                        ) [r_base, amp, twist_angle, z]
                    ) : (
                        // 3. Inner wall
                        let (
                            u_in = (k - M_out - M_rim) / M_in,
                            z = (height - r_rim) - u_in * (height - r_rim - bottom_thickness),
                            u_outer = clamp(z / height, 0, 1),
                            r_base_outer = r_base_func(u_outer),
                            r_base = r_base_outer - wall_thickness,
                            amp = r_base * 0.12,
                            twist_angle = u_outer * twist
                        ) [r_base, amp, twist_angle, z]
                    )
                ),
                
                r_base = params[0],
                amp = params[1],
                twist_angle = params[2],
                z = params[3]
            )
            for (a = [0 : Na-1])
            let (
                theta = a * 360 / Na,
                r = r_base + amp * cos(flutes * (theta - twist_angle)),
                x = r * cos(theta),
                y = r * sin(theta)
            ) [x, y, z]
        ],
        // Bottom outer center point
        [[0, 0, 0]],
        // Bottom inner center point
        [[0, 0, bottom_thickness]]
    );
    
    Nv = (K + 1) * Na;
    bottom_outer_center = Nv;
    bottom_inner_center = Nv + 1;
    
    // Generate all faces
    faces = concat(
        // Side faces connecting all slices sequentially (seamlessly loops over the rim!)
        [
            for (k = [0 : K-1])
            for (a = [0 : Na-1])
            let (
                v0 = k * Na + a,
                v1 = k * Na + ((a + 1) % Na),
                v2 = (k + 1) * Na + ((a + 1) % Na),
                v3 = (k + 1) * Na + a
            )
            each [[v0, v1, v2], [v0, v2, v3]]
        ],
        // Bottom outer cap
        [
            for (a = [0 : Na-1])
            let (
                v0 = a,
                v1 = (a + 1) % Na
            )
            [v1, v0, bottom_outer_center]
        ],
        // Bottom inner cap
        [
            for (a = [0 : Na-1])
            let (
                v0 = K * Na + a,
                v1 = K * Na + ((a + 1) % Na)
            )
            [v0, v1, bottom_inner_center]
        ]
    );
    
    polyhedron(points = vertices, faces = faces, convexity = 10);
}

// Render the elegant single-polyhedron vase
color("#D4AF37") // Polished gold
elegant_vase();
