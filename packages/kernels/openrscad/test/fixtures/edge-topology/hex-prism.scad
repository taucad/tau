// The guard against over-merging: six genuine 60-degree edges. Any smoothing
// rule that reaches these has gone too far.
linear_extrude(height = 20) circle(r = 10, $fn = 6);
