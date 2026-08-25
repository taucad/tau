// D3 — a polyhedron sampling a smooth surface. Every declared face interns its
// own patch, so without a merge rule this dome drew all 240 of its tessellation
// edges; the same defect took a 128 x 34 lamp shade to 17 536.
n = 16;
m = 8;
verts = concat(
  [[0, 0, 20]],
  [for (j = [1:m - 1], i = [0:n - 1])
      let (p = j * 180 / m, t = i * 360 / n)
      [20 * sin(p) * cos(t), 20 * sin(p) * sin(t), 20 * cos(p)]],
  [[0, 0, -20]]
);
top = [for (i = [0:n - 1]) [0, 1 + i, 1 + (i + 1) % n]];
bands = [for (j = [0:m - 3], i = [0:n - 1])
  [1 + j * n + i, 1 + (j + 1) * n + i, 1 + (j + 1) * n + (i + 1) % n, 1 + j * n + (i + 1) % n]];
bot = [for (i = [0:n - 1])
  [len(verts) - 1, 1 + (m - 2) * n + (i + 1) % n, 1 + (m - 2) * n + i]];
polyhedron(points = verts, faces = concat(top, bands, bot));
