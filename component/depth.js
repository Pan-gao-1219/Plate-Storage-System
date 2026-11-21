"use strict";

// Rasterize orthographic triangles with a depth buffer using Canvas 2D.
// A larger depth means the surface is closer to the camera.
class DepthRenderer {
  constructor() {
    this.surface = document.createElement("canvas");
    this.context = this.surface.getContext("2d");
  }

  begin(width, height) {
    this.width = width;
    this.height = height;
    if (this.surface.width !== width || this.surface.height !== height || !this.image) {
      this.surface.width = width;
      this.surface.height = height;
      this.image = this.context.createImageData(width, height);
      this.depth = new Float32Array(width * height);
    }
    this.image.data.fill(0);
    this.depth.fill(-Infinity);
  }

  triangle(a, b, c, [red, green, blue]) {
    let area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-6) return;
    if (area < 0) {
      [b, c] = [c, b];
      area = -area;
    }

    const x0 = Math.max(0, Math.ceil(Math.min(a[0], b[0], c[0]) - .5));
    const y0 = Math.max(0, Math.ceil(Math.min(a[1], b[1], c[1]) - .5));
    const x1 = Math.min(this.width - 1, Math.floor(Math.max(a[0], b[0], c[0]) - .5));
    const y1 = Math.min(this.height - 1, Math.floor(Math.max(a[1], b[1], c[1]) - .5));
    if (x1 < x0 || y1 < y0) return;

    const dxA = b[1] - c[1], dyA = c[0] - b[0];
    const dxB = c[1] - a[1], dyB = a[0] - c[0];
    const dxC = a[1] - b[1], dyC = b[0] - a[0];
    const offsetX = x0 + .5, offsetY = y0 + .5;
    let rowA = (offsetX - b[0]) * dxA + (offsetY - b[1]) * dyA;
    let rowB = (offsetX - c[0]) * dxB + (offsetY - c[1]) * dyB;
    let rowC = (offsetX - a[0]) * dxC + (offsetY - a[1]) * dyC;
    const zA = a[2] / area, zB = b[2] / area, zC = c[2] / area;
    const pixels = this.image.data;
    const depth = this.depth;
    for (let y = y0; y <= y1; y++) {
      let weightA = rowA, weightB = rowB, weightC = rowC;
      let index = y * this.width + x0;
      for (let x = x0; x <= x1; x++, index++) {
        if (weightA >= -1e-6 && weightB >= -1e-6 && weightC >= -1e-6) {
          const z = weightA * zA + weightB * zB + weightC * zC;
          if (z > depth[index]) {
            depth[index] = z;
            const offset = index * 4;
            pixels[offset] = red;
            pixels[offset + 1] = green;
            pixels[offset + 2] = blue;
            pixels[offset + 3] = 255;
          }
        }
        weightA += dxA;
        weightB += dxB;
        weightC += dxC;
      }
      rowA += dyA;
      rowB += dyB;
      rowC += dyC;
    }
  }

  draw(context, width, height) {
    this.context.putImageData(this.image, 0, 0);
    context.drawImage(this.surface, 0, 0, width, height);
  }
}
