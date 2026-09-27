// NACA 4-digit sections (Abbott & von Doenhoff). Cosine-sampled once.

function naca_xb(i, n) = 0.5 * (1 - cos(180 * i / n));

function naca_yt(xb, t) =
  let (x = max(xb, 0))
    5 * t * (
      0.2969 * sqrt(x)
      - 0.1260 * x
      - 0.3516 * x * x
      + 0.2843 * x * x * x
      - 0.1015 * x * x * x * x
    );

function naca_yc(xb, m, p) =
  (m == 0) ? 0
  : (xb < p)
    ? (m / (p * p)) * (2 * p * xb - xb * xb)
    : (m / ((1 - p) * (1 - p))) * ((1 - 2 * p) + 2 * p * xb - xb * xb);

function naca_dyc(xb, m, p) =
  (m == 0) ? 0
  : (xb < p)
    ? (2 * m / (p * p)) * (p - xb)
    : (2 * m / ((1 - p) * (1 - p))) * (p - xb);

function naca_point(xb, m, p, t, chord, side) =
  let (
    yt = naca_yt(xb, t) * chord,
    yc = naca_yc(xb, m, p) * chord,
    th = atan(naca_dyc(xb, m, p)),
    yt_use = (xb >= 0.999) ? 0.2 : yt
  )
    side > 0
      ? [xb * chord - yt_use * sin(th), yc + yt_use * cos(th)]
      : [xb * chord + yt_use * sin(th), yc - yt_use * cos(th)];

function naca_profile(m, p, t, chord, n = 24) =
  concat(
    [for (i = [0:n]) naca_point(naca_xb(i, n), m, p, t, chord, 1)],
    [for (i = [n - 1:-1:1]) naca_point(naca_xb(i, n), m, p, t, chord, -1)]
  );

function concat_all(list, i = 0) =
  i >= len(list) ? [] : concat(list[i], concat_all(list, i + 1));

function fuselage_ring(i, ns, nc, chord, width, m, p, t, nose_x) =
  let (
    xb = 0.5 * (1 - cos(180 * i / (ns + 1))),
    yt = naca_yt(xb, t) * chord,
    yc = naca_yc(xb, m, p) * chord,
    yt_ref = naca_yt(0.3, 1),
    yw = (width / 2) * max(naca_yt(xb, 1) / yt_ref, 0.04),
    xw = nose_x - xb * chord
  )
    [
      for (j = [0:nc - 1])
        let (a = 360 * j / nc)
          [xw, yw * cos(a), yc + yt * sin(a)]
    ];

function fuselage_points(ns, nc, chord, width, m, p, t, nose_x) =
  concat(
    [[nose_x, 0, 0]],
    concat_all([
      for (i = [1:ns])
        fuselage_ring(i, ns, nc, chord, width, m, p, t, nose_x)
    ]),
    [[nose_x - chord, 0, 0]]
  );

function ring_quads(a, b, nc) =
  [
    for (j = [0:nc - 1])
      [a + j, a + (j + 1) % nc, b + (j + 1) % nc, b + j]
  ];

function fuselage_faces(ns, nc) =
  let (te = 1 + ns * nc)
    concat(
      [for (j = [0:nc - 1]) [0, 1 + (j + 1) % nc, 1 + j]],
      concat_all([
        for (i = [0:ns - 2])
          ring_quads(1 + i * nc, 1 + (i + 1) * nc, nc)
      ]),
      [
        for (j = [0:nc - 1])
          [te, 1 + (ns - 1) * nc + j, 1 + (ns - 1) * nc + (j + 1) % nc]
      ]
    );

module naca_airfoil(m, p, t, chord, n = 24) {
  polygon(naca_profile(m, p, t, chord, n), convexity = 6);
}

module naca_body_revolution(t, chord, n = 24) {
  rotate_extrude(convexity = 8)
    polygon(
      concat(
        [[0.02, 0]],
        [
          for (i = [0:n])
            let (pt = naca_point(naca_xb(i, n), 0, 0.4, t, chord, 1))
              [max(pt[1], 0.05), pt[0]]
        ],
        [[0.02, chord]]
      ),
      convexity = 6
    );
}

module naca_fuselage_body(m, p, t, chord, width, nose_x, ns = 16, nc = 12) {
  polyhedron(
    points = fuselage_points(ns, nc, chord, width, m, p, t, nose_x),
    faces = fuselage_faces(ns, nc),
    convexity = 12
  );
}

$fa = 2;
$fs = 0.4;

linear_extrude(height = 15, convexity = 6)
  naca_airfoil(0.02, 0.4, 0.12, 100, 28);
