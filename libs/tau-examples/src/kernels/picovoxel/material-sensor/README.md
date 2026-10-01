# Material sensor

Original Apache-2.0 example: a painted enclosure, glass lens and brushed connector.
The small stripe PNG is authored here and embedded as encoded bytes; no external
asset or upstream port is required. `defaultParams.voxelSize` is in millimetres.

The final named descriptors carry standard glTF materials. The model envelope
shares image, texture and sampler indexes. The enclosure has a repeated color map
and clearcoat; the lens uses transmission/IOR/volume (distances in metres); the
connector uses anisotropy (rotation in radians). Tau derives box UV0 and tangents
on final geometry. Exact GLB and embedded JSON glTF retain appearance; STL does not.
