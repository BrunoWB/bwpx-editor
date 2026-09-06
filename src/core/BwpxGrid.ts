export class BwpxGrid {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number, initialData?: Uint8Array | number[]) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height);
    if (initialData) {
      this.data.set(initialData.slice(0, width * height));
    }
  }

  getIndex(x: number, y: number): number {
    return y * this.width + x;
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  get(x: number, y: number): number {
    if (!this.inBounds(x, y)) return 0;
    return this.data[this.getIndex(x, y)];
  }

  set(x: number, y: number, val: number): void {
    if (!this.inBounds(x, y)) return;
    this.data[this.getIndex(x, y)] = val ? 1 : 0;
  }

  toggle(x: number, y: number): void {
    if (!this.inBounds(x, y)) return;
    const idx = this.getIndex(x, y);
    this.data[idx] = this.data[idx] ? 0 : 1;
  }

  clear(val = 0): void {
    this.data.fill(val ? 1 : 0);
  }

  invert(): BwpxGrid {
    const next = new BwpxGrid(this.width, this.height);
    for (let i = 0; i < this.data.length; i++) {
      next.data[i] = this.data[i] ? 0 : 1;
    }
    return next;
  }

  flipH(): BwpxGrid {
    const next = new BwpxGrid(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        next.set(this.width - 1 - x, y, this.get(x, y));
      }
    }
    return next;
  }

  flipV(): BwpxGrid {
    const next = new BwpxGrid(this.width, this.height);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        next.set(x, this.height - 1 - y, this.get(x, y));
      }
    }
    return next;
  }

  rotate90(): BwpxGrid {
    // 90 degrees clockwise: new width is old height, new height is old width
    const next = new BwpxGrid(this.height, this.width);
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        next.set(this.height - 1 - y, x, this.get(x, y));
      }
    }
    return next;
  }

  countOn(): number {
    let count = 0;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i]) count++;
    }
    return count;
  }

  clone(): BwpxGrid {
    return new BwpxGrid(this.width, this.height, this.data);
  }

  /**
   * Serializes to 1-bit-per-pixel byte array with row-major MSB first stride
   * (matching standard Zephyr / SSD1306 display drivers).
   */
  to1bppBytes(stride?: number): Uint8Array {
    const actualStride = stride ?? Math.ceil(this.width / 8);
    const bytes = new Uint8Array(this.height * actualStride);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y)) {
          const byteIdx = y * actualStride + Math.floor(x / 8);
          const bitIdx = 7 - (x % 8);
          bytes[byteIdx] |= (1 << bitIdx);
        }
      }
    }

    return bytes;
  }

  static from1bppBytes(bytes: Uint8Array, width: number, height: number, stride?: number): BwpxGrid {
    const actualStride = stride ?? Math.ceil(width / 8);
    const grid = new BwpxGrid(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const byteIdx = y * actualStride + Math.floor(x / 8);
        if (byteIdx < bytes.length) {
          const bitIdx = 7 - (x % 8);
          const isSet = (bytes[byteIdx] >> bitIdx) & 1;
          grid.set(x, y, isSet);
        }
      }
    }

    return grid;
  }

  /**
   * Generates a readable C array with hex values and binary ASCII visual comments.
   */
  toCArray(varName = "IMAGE_BITMAP"): string {
    const stride = Math.ceil(this.width / 8);
    const bytes = this.to1bppBytes(stride);
    const lines: string[] = [];

    lines.push(`/* ${this.width}x${this.height} 1bpp monochrome bitmap (stride ${stride}) */`);
    lines.push(`static const uint8_t ${varName}[${this.height * stride}] = {`);

    for (let y = 0; y < this.height; y++) {
      const hexParts: string[] = [];
      let asciiComment = "";

      for (let s = 0; s < stride; s++) {
        const b = bytes[y * stride + s];
        hexParts.push("0x" + b.toString(16).toUpperCase().padStart(2, "0"));
      }

      for (let x = 0; x < this.width; x++) {
        asciiComment += this.get(x, y) ? "#" : " ";
      }

      lines.push(`    ${hexParts.join(", ")}, // Row ${y.toString().padStart(2, " ")}: |${asciiComment}|`);
    }

    lines.push("};");
    return lines.join("\n");
  }

  /**
   * Extracts a sub-rectangle region as a new BwpxGrid.
   */
  getSubRect(x: number, y: number, w: number, h: number): BwpxGrid {
    const sub = new BwpxGrid(w, h);
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        sub.set(c, r, this.get(x + c, y + r));
      }
    }
    return sub;
  }

  /**
   * Pastes a sub-rectangle region into this grid at (dstX, dstY).
   */
  blit(src: BwpxGrid, dstX: number, dstY: number, transparentZero = false): void {
    for (let r = 0; r < src.height; r++) {
      for (let c = 0; c < src.width; c++) {
        const val = src.get(c, r);
        if (!transparentZero || val === 1) {
          this.set(dstX + c, dstY + r, val);
        }
      }
    }
  }
}
