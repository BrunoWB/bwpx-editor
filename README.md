# bwpx-editor

A high-performance, lightweight 1-bit monochrome (0 or 1) HTML5 Canvas pixel editor component and web application. Designed for OLED displays (SSD1306, SH1106, e-ink, ZMK firmware), retro gaming, and icon/font authoring.

![OLED Pixel Editor UI](https://raw.githubusercontent.com/BrunoWB/bwpx-editor/main/public/preview.png)

---

## Features

- **Fast Drawing Ergonomics**:
  - **Pencil**: Left-click to draw (1px, 2px, 3px, 4px).
  - **Fast Erase**: Right-click to erase without switching tools.
  - **Fast Selection**: Hold `Shift` and drag to create rectangular marquee selections.
  - **Pan & Zoom**: Spacebar + drag or middle-click to pan; scroll wheel to zoom (up to 6400% with crisp pixel gridlines).
- **Drawing & Shape Toolkit**:
  - Pencil, Flood Fill Bucket.
  - Line (Bresenham algorithm).
  - Rectangle & Filled Rectangle.
  - Circle/Ellipse & Filled Circle.
  - Triangle & Filled Triangle.
  - Diamond, 5-Point Star, Arrow, Cross/Plus.
- **Transformations**:
  - Invert colors.
  - Flip Horizontal & Flip Vertical.
  - Rotate 90° clockwise.
- **Export / Import**:
  - **C 1bpp Byte Array**: Ready to paste into Zephyr / ZMK headers (`custom_display_assets.h`), formatted with hex bytes and visual ASCII row comments.
  - **PNG Image**: Export 1-bit monochrome images or import any image with auto-thresholding.
  - **JSON Project**: Save and reload pixel grids.
- **OLED Presets**:
  - 128×32 (Corne SSD1306 hardware landscape).
  - 32×128 (Corne vertical portrait).
  - 128×64 (Standard 0.96" OLED).
  - 128×34 (ZMK Symbols Atlas).
  - 128×22 (ZMK Font Atlas).

---

## Embedding as a React Component

```tsx
import { BwpxEditor, BwpxGrid } from 'bwpx-editor';

function MyStudio() {
  return (
    <BwpxEditor
      initialWidth={128}
      initialHeight={32}
      title="CUSTOM OLED EDITOR"
      onGridChange={(grid) => {
        console.log("C Code:", grid.toCArray("MY_BITMAP"));
      }}
    />
  );
}
```

---

## Development

```bash
# Install dependencies
npm install

# Start Vite dev server
npm run dev

# Build for production
npm run build
```
