function _inv(a) = tan(a) - a * PI / 180;

module _tooth(br, dr, ar, offs, steps) {
    rr = max(br, dr);
    right = [ for (j = [0 : steps])
        let (r = rr + (ar - rr) * j / steps,
             a = acos(br / r),
             id = _inv(a) * 180 / PI,
             an = offs - id)
        [r * cos(an), r * sin(an)] ];
    left = [ for (j = [steps : -1 : 0])
        let (r = rr + (ar - rr) * j / steps,
             a = acos(br / r),
             id = _inv(a) * 180 / PI,
             an = -(offs - id))
        [r * cos(an), r * sin(an)] ];
    polygon(concat(
        [[dr * cos(offs), dr * sin(offs)]],
        right,
        left,
        [[dr * cos(offs), -dr * sin(offs)]]));
}

module _toothed_2d(z, br, dr, ar, offs, steps) {
    union() {
        circle(r = dr + 0.15);
        for (i = [0 : z - 1]) rotate(i * 360 / z) _tooth(br, dr, ar, offs, steps);
    }
}

module spur_gear(m, z, h, pa = 20, clearance = 0.25, backlash = 0,
                 steps = 20, center = false) {
    pr = m * z / 2;
    br = pr * cos(pa);
    ar = pr + m;
    dr = pr - m * (1 + clearance);
    ct = PI * m / 2 - backlash;
    offs = (ct / (2 * pr)) * 180 / PI + _inv(pa) * 180 / PI;
    linear_extrude(height = h, center = center, convexity = 10)
        _toothed_2d(z, br, dr, ar, offs, steps);
}

module internal_ring(m, z, h, outer_r, pa = 20, clearance = 0.25,
                     backlash = 0, steps = 20, center = false) {
    pr = m * z / 2;
    br = pr * cos(pa);
    ar = pr + m * (1 + clearance);
    dr = pr - m * (1 + clearance);
    ct = PI * m / 2 + backlash;
    offs = (ct / (2 * pr)) * 180 / PI + _inv(pa) * 180 / PI;
    linear_extrude(height = h, center = center, convexity = 10)
        difference() {
            circle(r = outer_r);
            rotate(180 / z) _toothed_2d(z, br, dr, ar, offs, steps);
        }
}

spur_gear(1, 24, 8);
