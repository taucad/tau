/**
 * Card Holder Model
 * A customizable card holder with a handle and a lock.
 */
import {
  Sketcher,
  sketchRectangle,
  sketchCircle,
  Plane,
  FaceFinder,
  makePlane,
} from 'replicad';

export default function main() {
  const handleBase = new Sketcher('XY')
    .vLine(89)
    .hLine(20.5)
    .line(57 - 20.5, -3.5)
    .vLine(-82)
    .line(-57 + 20.5, -3.5)
    .hLine(-20.5)
    .close()
    .extrude(9)
    .fillet(5, (e) =>
      e
        .inDirection('Z')
        .containsPoint([57, 3.5, 0]),
    )
    .fillet(5, (e) =>
      e
        .inDirection('Z')
        .containsPoint([
          57,
          89 - 3.5,
          0,
        ]),
    )
    .fillet(1, (e) =>
      e.inBox([0, 0, 9], [20.5, 89, 0]),
    );

  const border = 3;

  const fingerAreaNegative =
    new Sketcher('XY')
      .line(57 - 20.5 - border, -3.5)
      .vLine(-82 + border * 2)
      .line(-57 + 20.5 + border, -3.5)
      .close()
      .extrude(30) // =RD= increased this to 30 mm as example
      .fillet(5, (edgeFilter) =>
        edgeFilter.inDirection('Z'),
      )
      .fillet(1.5); // =RD= added a fillet here

  const lockNegative = sketchRectangle(
    25,
    7,
    makePlane('XY'),
  )
    .extrude(20)
    .rotate(90, undefined, [1, 0, 0])
    .rotate(90, undefined, [0, 0, 1])
    .translate([0, 0, 3.5]);

  const lockSmallTabSpaceNegative =
    sketchRectangle(
      15,
      5,
      makePlane('XY'),
    )
      .extrude(3)
      .rotate(90, undefined, [1, 0, 0])
      .rotate(90, undefined, [0, 0, 1])
      .translate([0, 0, 2.5]);

  const screwHole = sketchCircle(
    4,
    new Plane([0, 0, 0]),
  )
    .loftWith([
      sketchCircle(
        1.5,
        new Plane([0, 0, -3]),
      ),
      sketchCircle(
        1.5,
        new Plane([0, 0, -9]),
      ),
    ])
    .translate([0, 0, 9]);

  const cutFingerArea = handleBase.cut(
    fingerAreaNegative.translate([
      20.5,
      89 - border,
      2,
    ]),
  );
  const filletFingerArea =
    cutFingerArea.fillet(1.4); // Here
  const cutLock = filletFingerArea.cut(
    lockNegative.translate([
      2,
      89 / 2,
      0,
    ]),
  );
  const cutLockTab = cutLock.cut(
    lockSmallTabSpaceNegative.translate(
      [57 - 3, 89 / 2, 0],
    ),
  );
  const cutScrewHoleTop =
    cutLockTab.cut(
      screwHole
        .clone()
        .translate([10, 6, 0]),
    );
  const cutScrewHoleBottom =
    cutScrewHoleTop.cut(
      screwHole.translate([
        10,
        89 - 6,
        0,
      ]),
    );

  const handle = cutScrewHoleBottom;

  return {
    shape: handle,
    highlight: new FaceFinder().inPlane(
      'XY',
      9,
    ),
  };
}
