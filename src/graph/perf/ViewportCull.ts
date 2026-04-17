export interface ViewportBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface PositionedNode {
  x: number;
  y: number;
  r: number;
}

export function isNodeVisibleInViewport(
  node: PositionedNode,
  viewport: ViewportBounds,
  padding = 0
): boolean {
  const radius = node.r + padding;
  const minX = node.x - radius;
  const maxX = node.x + radius;
  const minY = node.y - radius;
  const maxY = node.y + radius;

  if (maxX < viewport.left || minX > viewport.right) {
    return false;
  }
  if (maxY < viewport.top || minY > viewport.bottom) {
    return false;
  }
  return true;
}
