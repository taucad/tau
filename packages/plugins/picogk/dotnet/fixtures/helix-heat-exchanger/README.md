# LEAP 71 Helix Heat Exchanger compatibility fixture

This fixture contains unchanged C# source from LEAP 71 ShapeKernel and HelixHeatX at the revisions recorded in `PROVENANCE.json`. `Program.cs` is the ordinary PicoGK entry point used by Tau's compatibility test; its 1 mm voxel size keeps the full-model acceptance run bounded.

The copied projects are Apache-2.0 licensed. Their original license texts are retained as `LICENSE.ShapeKernel` and `LICENSE.HeatX`. Tests must use this checked-in corpus and must not depend on the optional `repos/` investigation checkouts.
