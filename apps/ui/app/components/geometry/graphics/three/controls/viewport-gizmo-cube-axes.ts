import * as THREE from 'three';
import { Line2, LineGeometry, LineMaterial } from 'three/addons';

export type ViewportGizmoCubeAxesProps = {
  readonly axesSize?: number;
  readonly xAxisColor?: string;
  readonly yAxisColor?: string;
  readonly zAxisColor?: string;
  readonly xLabelColor?: string;
  readonly yLabelColor?: string;
  readonly zLabelColor?: string;
  readonly lineOpacity?: number;
  readonly lineWidth?: number;
};

export const createViewportGizmoCubeAxes = ({
  axesSize = 2.1,
  xAxisColor = 'red',
  yAxisColor = 'green',
  zAxisColor = 'blue',
  xLabelColor = 'red',
  yLabelColor = 'green',
  zLabelColor = 'blue',
  lineOpacity = 0.6,
  lineWidth = 1.5,
}: ViewportGizmoCubeAxesProps): THREE.Group => {
  const axesLines = [
    {
      id: 'x',
      points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(axesSize, 0, 0)],
      lineColor: xAxisColor,
      labelColor: xLabelColor,
      label: 'X',
    },
    {
      id: 'y',
      points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, axesSize, 0)],
      lineColor: yAxisColor,
      labelColor: yLabelColor,
      label: 'Y',
    },
    {
      id: 'z',
      points: [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, axesSize)],
      lineColor: zAxisColor,
      labelColor: zLabelColor,
      label: 'Z',
    },
  ];

  const axes = new THREE.Group();
  for (const line of axesLines) {
    // Convert points to flat array for LineGeometry
    const positions = [];
    for (const point of line.points) {
      positions.push(point.x, point.y, point.z);
    }

    const geometry = new LineGeometry();
    geometry.setPositions(positions);

    const material = new LineMaterial({
      color: line.lineColor,
      linewidth: lineWidth,
      opacity: lineOpacity,
      resolution: new THREE.Vector2(axesSize, axesSize),
    });

    const lineObject = new Line2(geometry, material);
    axes.add(lineObject);

    // Add text label at the end of each axis
    const endPoint = line.points[1]!;

    // Create a canvas for the text
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const textCanvasSize = 64;
    canvas.width = textCanvasSize;
    canvas.height = textCanvasSize;

    if (context) {
      // Set the entire canvas to transparent
      context.clearRect(0, 0, canvas.width, canvas.height);

      // Draw the text with smaller font size
      context.fillStyle = line.labelColor;
      context.font = '100 48px monospace';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(line.label, textCanvasSize / 2, textCanvasSize / 2);
    }

    // Create texture from canvas
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;

    // Create a sprite with the texture
    const spriteMaterial = new THREE.SpriteMaterial({
      map: texture,
      sizeAttenuation: false,
      depthTest: true,
      transparent: true,
    });

    // Set render order to ensure it renders on top
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.renderOrder = 3;
    sprite.position.copy(endPoint);
    sprite.scale.set(0.08, 0.06, 1); // Reduced vertical scale from 0.1 to 0.06

    // Add increased offset to move labels further from line ends
    const direction = new THREE.Vector3().subVectors(endPoint, new THREE.Vector3(0, 0, 0)).normalize();
    sprite.position.add(direction.multiplyScalar(0.2));

    axes.add(sprite);
  }

  axes.position.set(-axesSize / 2, -axesSize / 2, -axesSize / 2);
  return axes;
};
