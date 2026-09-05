using PicoGK;

Library.Go(1.0f, () =>
{
    var sphere = ShapeFactory.Create(16.0f);
    Library.oViewer().SetGroupMaterial(0, "25a18e", 0.2f, 0.7f);
    Library.oViewer().Add(sphere);
});
