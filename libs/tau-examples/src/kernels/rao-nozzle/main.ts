import type { Shape3D } from 'replicad';
import { draw } from 'replicad';

export const defaultParams = {
  thrust_kN: 10, // Controllable thrust parameter
  chamberPressure_MPa: 10, // Chamber pressure (affects throat size)
  expansionRatio: 40, // Ae/At
  bellFraction: 0.8, // Rao fractional length (80% bell)
  wallThickness: 2, // Structural thickness
  theta_n: 32, // Inflection angle
  theta_e: 8, // Exit angle
};

export function generateRaoNozzle(
  parameters = defaultParams,
): Shape3D {
  // Basic rocket propulsion sizing
  const F = parameters.thrust_kN * 1000; // Thrust in Newtons
  const Pc =
    parameters.chamberPressure_MPa *
    1_000_000; // Chamber pressure in Pascals
  const Cf = 1.5; // Estimated thrust coefficient

  // Calculate throat area and radius
  const At = F / (Pc * Cf); // Area in m^2
  const Rt_m = Math.sqrt(At / Math.PI); // Radius in m
  const Rt = Rt_m * 1000; // Radius in mm

  const th_n =
    (parameters.theta_n * Math.PI) /
    180;
  const th_e =
    (parameters.theta_e * Math.PI) /
    180;
  const t = parameters.wallThickness;

  // -----------------------------------------------------
  // Convergent section geometry
  // -----------------------------------------------------
  const Rc_arc = 1.5 * Rt;

  const x_ca =
    -Rc_arc *
    Math.sin((45 * Math.PI) / 180);
  const y_ca =
    Rt +
    Rc_arc *
      (1 -
        Math.cos((45 * Math.PI) / 180));

  const x_mid_ca =
    -Rc_arc *
    Math.sin((22.5 * Math.PI) / 180);
  const y_mid_ca =
    Rt +
    Rc_arc *
      (1 -
        Math.cos(
          (22.5 * Math.PI) / 180,
        ));

  const Rc = 3 * Rt; // Chamber radius
  const x_c = x_ca - (Rc - y_ca); // Base of 45-deg cone
  const chamberLength = Rc; // Length of straight chamber
  const x_start = x_c - chamberLength;

  // -----------------------------------------------------
  // Divergent section geometry
  // -----------------------------------------------------
  const R_arc = 0.382 * Rt;

  const x_n = R_arc * Math.sin(th_n);
  const y_n =
    Rt + R_arc * (1 - Math.cos(th_n));

  const x_mid_n =
    R_arc * Math.sin(th_n / 2);
  const y_mid_n =
    Rt +
    R_arc * (1 - Math.cos(th_n / 2));

  // Exit point calculation
  const Re =
    Rt *
    Math.sqrt(
      parameters.expansionRatio,
    );
  const Lf =
    (Re - Rt) /
    Math.tan((15 * Math.PI) / 180);
  const L =
    parameters.bellFraction * Lf;
  const x_e = L;
  const y_e = Re;

  // Parabolic bell Bezier control point
  // The curve must be tangent to theta_n at inflection and theta_e at exit
  const m1 = Math.tan(th_n);
  const m2 = Math.tan(th_e);
  const x_c_bez =
    (y_e - y_n + m1 * x_n - m2 * x_e) /
    (m1 - m2);
  const y_c_bez =
    m1 * (x_c_bez - x_n) + y_n;

  // -----------------------------------------------------
  // Draw 2D Profile
  // -----------------------------------------------------
  const profile = draw()
    // Start inner wall from chamber
    .movePointerTo([x_start, Rc])
    .lineTo([x_c, Rc])
    // 45 degree convergent cone
    .lineTo([x_ca, y_ca])
    // Convergent throat arc
    .threePointsArcTo(
      [0, Rt],
      [x_mid_ca, y_mid_ca],
    )
    // Divergent throat arc
    .threePointsArcTo(
      [x_n, y_n],
      [x_mid_n, y_mid_n],
    )
    // Parabolic bell (Bezier curve)
    .quadraticBezierCurveTo(
      [x_e, y_e],
      [x_c_bez, y_c_bez],
    )

    // Outer wall (offset by thickness 't', tracing backwards)
    .lineTo([x_e, y_e + t])
    .quadraticBezierCurveTo(
      [x_n, y_n + t],
      [x_c_bez, y_c_bez + t],
    )
    .threePointsArcTo(
      [0, Rt + t],
      [x_mid_n, y_mid_n + t],
    )
    .threePointsArcTo(
      [x_ca, y_ca + t],
      [x_mid_ca, y_mid_ca + t],
    )
    .lineTo([x_c, Rc + t])
    .lineTo([x_start, Rc + t])
    .close();

  // Revolve around X-axis
  return profile
    .sketchOnPlane('XY')
    .revolve([1, 0, 0]);
}

export default function main(
  parameters = defaultParams,
) {
  return generateRaoNozzle(parameters);
}
