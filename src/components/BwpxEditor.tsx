import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BwpxGrid } from '../core/BwpxGrid';
import {
  drawLine,
  drawRect,
  drawEllipse,
  drawTriangle,
  drawDiamond,
  drawStar,
  drawArrow,
  drawPlus,
  floodFill,
  drawBrushDot,
} from '../core/algorithms';
import {
  Undo2,
  Redo2,
  Pencil,
  Eraser,
  PaintBucket,
  MousePointer2,
  Minus,
  Square,
  Circle,
  Triangle,
  Sparkles,
  ArrowRight,
  Plus,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Maximize2,
  Upload,
  FileCode,
  Check,
  Copy,
} from 'lucide-react';

export type ToolType =
  | 'pencil'
  | 'eraser'
  | 'bucket'
  | 'select'
  | 'line'
  | 'rect'
  | 'filled-rect'
  | 'ellipse'
  | 'filled-ellipse'
  | 'triangle'
  | 'filled-triangle'
  | 'diamond'
  | 'star'
  | 'arrow'
  | 'plus';

export interface BwpxEditorProps {
  initialWidth?: number;
  initialHeight?: number;
  initialGrid?: BwpxGrid;
  onGridChange?: (grid: BwpxGrid) => void;
  title?: string;
  showPresets?: boolean;
}

export const BwpxEditor: React.FC<BwpxEditorProps> = ({
  initialWidth = 128,
  initialHeight = 32,
  initialGrid,
  onGridChange,
  title = 'OLED PIXEL EDITOR',
  showPresets = true,
}) => {
  const [grid, setGrid] = useState<BwpxGrid>(
    () => initialGrid?.clone() ?? new BwpxGrid(initialWidth, initialHeight)
  );
  const [history, setHistory] = useState<BwpxGrid[]>([
    initialGrid?.clone() ?? new BwpxGrid(initialWidth, initialHeight),
  ]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  const [activeTool, setActiveTool] = useState<ToolType>('pencil');
  const [brushSize, setBrushSize] = useState<number>(1);
  const [zoom, setZoom] = useState<number>(12); // pixels per cell
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 40, y: 40 });

  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [drawButton, setDrawButton] = useState<number>(0);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [isSpaceHeld, setIsSpaceHeld] = useState<boolean>(false);
  const [dragCurrentPos, setDragCurrentPos] = useState<{ x: number; y: number } | null>(null);

  const [selection, setSelection] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
    active: boolean;
    data?: BwpxGrid;
  } | null>(null);

  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [modalContent, setModalContent] = useState<{ title: string; text: string } | null>(null);
  const [copiedNotification, setCopiedNotification] = useState<boolean>(false);

  // Stores the previous selection rect when performing an additive (Shift/Cmd) select drag
  const additiveSelectionBase = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  // Tracks the grid-coord where a floating-selection move drag started (for delta calculation)
  const floatingSelDragStart = useRef<{ x: number; y: number } | null>(null);
  // Origin of the selection when a move drag started (for delta offset)
  const floatingSelOrigin = useRef<{ x: number; y: number } | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Sync with initialGrid prop if it changes externally
  useEffect(() => {
    if (initialGrid) {
      setGrid(initialGrid.clone());
      setHistory([initialGrid.clone()]);
      setHistoryIndex(0);
    }
  }, [initialGrid]);

  const commitGridState = useCallback(
    (newGrid: BwpxGrid) => {
      const nextHistory = history.slice(0, historyIndex + 1);
      nextHistory.push(newGrid.clone());
      setHistory(nextHistory);
      setHistoryIndex(nextHistory.length - 1);
      setGrid(newGrid);
      onGridChange?.(newGrid);
    },
    [history, historyIndex, onGridChange]
  );

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      const nextIdx = historyIndex - 1;
      setHistoryIndex(nextIdx);
      const nextGrid = history[nextIdx].clone();
      setGrid(nextGrid);
      onGridChange?.(nextGrid);
    }
  }, [historyIndex, history, onGridChange]);

  const handleRedo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      const nextGrid = history[nextIdx].clone();
      setGrid(nextGrid);
      onGridChange?.(nextGrid);
    }
  }, [historyIndex, history, onGridChange]);

  // Center view on mount or size change
  const fitToView = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const availableW = rect.width - 80;
    const availableH = rect.height - 80;
    const fitZoom = Math.max(2, Math.floor(Math.min(availableW / grid.width, availableH / grid.height)));
    setZoom(fitZoom);
    setPan({
      x: Math.round((rect.width - grid.width * fitZoom) / 2),
      y: Math.round((rect.height - grid.height * fitZoom) / 2),
    });
  }, [grid.width, grid.height]);

  useEffect(() => {
    fitToView();
  }, [fitToView]);

  // Render canvas loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Render preview state if dragging shape or drawing
    let displayGrid = grid;
    if (isDrawing && startPos && dragCurrentPos && activeTool !== 'pencil' && activeTool !== 'eraser' && activeTool !== 'bucket' && activeTool !== 'select') {
      const temp = grid.clone();
      const val = drawButton === 2 ? 0 : 1;
      switch (activeTool) {
        case 'line':
          drawLine(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, brushSize);
          break;
        case 'rect':
          drawRect(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, false, brushSize);
          break;
        case 'filled-rect':
          drawRect(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, true, brushSize);
          break;
        case 'ellipse':
          drawEllipse(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, false, brushSize);
          break;
        case 'filled-ellipse':
          drawEllipse(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, true, brushSize);
          break;
        case 'triangle':
          drawTriangle(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, false, brushSize);
          break;
        case 'filled-triangle':
          drawTriangle(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, true, brushSize);
          break;
        case 'diamond':
          drawDiamond(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, false, brushSize);
          break;
        case 'star':
          drawStar(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, brushSize);
          break;
        case 'arrow':
          drawArrow(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, brushSize);
          break;
        case 'plus':
          drawPlus(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, brushSize);
          break;
      }
      displayGrid = temp;
    }

    // Outer border/shadow of grid
    const gridW = grid.width * zoom;
    const gridH = grid.height * zoom;

    ctx.save();
    ctx.translate(pan.x, pan.y);

    // Canvas background
    ctx.fillStyle = '#1b1e25';
    ctx.fillRect(0, 0, gridW, gridH);

    // Draw pixels
    for (let y = 0; y < displayGrid.height; y++) {
      for (let x = 0; x < displayGrid.width; x++) {
        if (displayGrid.get(x, y)) {
          ctx.fillStyle = '#00e5a3'; // Active pixel (OLED cyan/emerald)
          ctx.fillRect(x * zoom, y * zoom, zoom, zoom);
        }
      }
    }

    // Draw pixel grid lines if zoomed in enough
    if (zoom >= 4) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= displayGrid.width; x++) {
        ctx.moveTo(x * zoom, 0);
        ctx.lineTo(x * zoom, gridH);
      }
      for (let y = 0; y <= displayGrid.height; y++) {
        ctx.moveTo(0, y * zoom);
        ctx.lineTo(gridW, y * zoom);
      }
      ctx.stroke();
    }

    // Outer grid border
    ctx.strokeStyle = '#363d4a';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, gridW, gridH);

    // Draw selection marquee if active
    if (selection && selection.active) {
      // If there is floating pixel data, draw it at the selection position (opaque: black = dark tile)
      if (selection.data) {
        for (let r = 0; r < selection.data.height; r++) {
          for (let c = 0; c < selection.data.width; c++) {
            const px = selection.x + c;
            const py = selection.y + r;
            if (selection.data.get(c, r)) {
              ctx.fillStyle = '#00e5a3'; // lit pixel
            } else {
              ctx.fillStyle = '#1b1e25'; // dark pixel — opaque, overwrites underneath
            }
            ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
          }
        }
      }

      // Marquee dashes
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        selection.x * zoom,
        selection.y * zoom,
        selection.w * zoom,
        selection.h * zoom
      );
      ctx.setLineDash([]);
    }

    // Draw hover brush indicator
    if (hoverPos && grid.inBounds(hoverPos.x, hoverPos.y)) {
      const half = Math.floor(brushSize / 2);
      ctx.strokeStyle = 'rgba(0, 229, 163, 0.6)';
      ctx.lineWidth = 1;
      ctx.strokeRect(
        (hoverPos.x - half) * zoom,
        (hoverPos.y - half) * zoom,
        brushSize * zoom,
        brushSize * zoom
      );
    }

    ctx.restore();
  }, [grid, pan, zoom, isDrawing, startPos, dragCurrentPos, activeTool, drawButton, brushSize, selection, hoverPos]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Handle Resize of canvas container
  useEffect(() => {
    const updateCanvasSize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        renderCanvas();
      }
    };
    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [renderCanvas]);

  // Coordinate conversion helper
  const getGridCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const canvasX = clientX - rect.left - pan.x;
    const canvasY = clientY - rect.top - pan.y;
    return {
      x: Math.floor(canvasX / zoom),
      y: Math.floor(canvasY / zoom),
    };
  };

  // Spacebar tracking for panning
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat) {
        setIsSpaceHeld(true);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpaceHeld(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Mouse Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle click or spacebar -> Pan
    if (e.button === 1 || isSpaceHeld) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      return;
    }

    const coords = getGridCoords(e.clientX, e.clientY);
    if (!coords) return;

    // --- Select tool: handle click-inside-selection ---
    if (activeTool === 'select' && selection?.active) {
      const inside =
        coords.x >= selection.x &&
        coords.x < selection.x + selection.w &&
        coords.y >= selection.y &&
        coords.y < selection.y + selection.h;

      if (inside) {
        if (e.shiftKey || e.metaKey) {
          // Additive drag: remember the current selection as the base to union with
          additiveSelectionBase.current = { x: selection.x, y: selection.y, w: selection.w, h: selection.h };
          setIsDrawing(true);
          setStartPos(coords);
          setDragCurrentPos(coords);
        } else {
          // Lift the selection: capture pixels, erase source, begin move drag
          const captured = selection.data ?? grid.getSubRect(selection.x, selection.y, selection.w, selection.h);
          // Erase source region only if we're lifting fresh (no existing float)
          if (!selection.data) {
            const erased = grid.clone();
            for (let r = 0; r < selection.h; r++) {
              for (let c = 0; c < selection.w; c++) {
                erased.set(selection.x + c, selection.y + r, 0);
              }
            }
            commitGridState(erased);
          }
          floatingSelDragStart.current = coords;
          floatingSelOrigin.current = { x: selection.x, y: selection.y };
          setSelection({ ...selection, data: captured });
          setIsDrawing(true);
          setStartPos(coords);
          setDragCurrentPos(coords);
        }
        return;
      } else if (selection.data) {
        // Clicking outside a floating selection → stamp it down opaquely first
        const stamped = grid.clone();
        stamped.blit(selection.data, selection.x, selection.y, false); // transparentZero=false → opaque
        commitGridState(stamped);
        setSelection(null);
        floatingSelDragStart.current = null;
        floatingSelOrigin.current = null;
        additiveSelectionBase.current = null;
        // Fall through to start a new selection below
      }
    }

    // Shift key (outside of select tool) enables rapid selection switch
    if (e.shiftKey && activeTool !== 'select') {
      setActiveTool('select');
      setIsDrawing(true);
      setStartPos(coords);
      setDragCurrentPos(coords);
      setSelection({ x: coords.x, y: coords.y, w: 1, h: 1, active: true });
      additiveSelectionBase.current = null;
      return;
    }

    setIsDrawing(true);
    setDrawButton(e.button); // 0 = left draw, 2 = right erase
    setStartPos(coords);
    setDragCurrentPos(coords);

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      const temp = grid.clone();
      const val = e.button === 2 || activeTool === 'eraser' ? 0 : 1;
      drawBrushDot(temp, coords.x, coords.y, val, brushSize);
      commitGridState(temp);
    } else if (activeTool === 'bucket') {
      const temp = grid.clone();
      const val = e.button === 2 ? 0 : 1;
      floodFill(temp, coords.x, coords.y, val);
      commitGridState(temp);
    } else if (activeTool === 'select') {
      additiveSelectionBase.current = null;
      setSelection({ x: coords.x, y: coords.y, w: 1, h: 1, active: true });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    const coords = getGridCoords(e.clientX, e.clientY);
    setHoverPos(coords);

    if (!isDrawing || !coords) return;

    setDragCurrentPos(coords);

    if (activeTool === 'pencil' || activeTool === 'eraser') {
      const val = drawButton === 2 || activeTool === 'eraser' ? 0 : 1;
      if (grid.get(coords.x, coords.y) !== val) {
        const temp = grid.clone();
        if (startPos) {
          drawLine(temp, startPos.x, startPos.y, coords.x, coords.y, val, brushSize);
        } else {
          drawBrushDot(temp, coords.x, coords.y, val, brushSize);
        }
        setStartPos(coords);
        commitGridState(temp);
      }
    } else if (activeTool === 'select' && startPos) {
      // If we're moving a floating selection, translate its position
      if (floatingSelDragStart.current && floatingSelOrigin.current && selection?.data) {
        const dx = coords.x - floatingSelDragStart.current.x;
        const dy = coords.y - floatingSelDragStart.current.y;
        setSelection((prev) =>
          prev ? { ...prev, x: floatingSelOrigin.current!.x + dx, y: floatingSelOrigin.current!.y + dy } : prev
        );
        return;
      }

      // Otherwise resize the marquee rect
      const dragMinX = Math.min(startPos.x, coords.x);
      const dragMinY = Math.min(startPos.y, coords.y);
      const dragMaxX = Math.max(startPos.x, coords.x);
      const dragMaxY = Math.max(startPos.y, coords.y);

      if (additiveSelectionBase.current) {
        // Union bounding box of base + current drag rect
        const base = additiveSelectionBase.current;
        const unionMinX = Math.min(dragMinX, base.x);
        const unionMinY = Math.min(dragMinY, base.y);
        const unionMaxX = Math.max(dragMaxX, base.x + base.w - 1);
        const unionMaxY = Math.max(dragMaxY, base.y + base.h - 1);
        setSelection({ x: unionMinX, y: unionMinY, w: unionMaxX - unionMinX + 1, h: unionMaxY - unionMinY + 1, active: true });
      } else {
        setSelection({ x: dragMinX, y: dragMinY, w: dragMaxX - dragMinX + 1, h: dragMaxY - dragMinY + 1, active: true });
      }
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
      return;
    }

    if (isDrawing && startPos && dragCurrentPos) {
      const val = drawButton === 2 ? 0 : 1;
      const temp = grid.clone();

      if (activeTool !== 'pencil' && activeTool !== 'eraser' && activeTool !== 'bucket' && activeTool !== 'select') {
        switch (activeTool) {
          case 'line':
            drawLine(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, brushSize);
            break;
          case 'rect':
            drawRect(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, false, brushSize);
            break;
          case 'filled-rect':
            drawRect(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, true, brushSize);
            break;
          case 'ellipse':
            drawEllipse(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, false, brushSize);
            break;
          case 'filled-ellipse':
            drawEllipse(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, true, brushSize);
            break;
          case 'triangle':
            drawTriangle(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, false, brushSize);
            break;
          case 'filled-triangle':
            drawTriangle(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, true, brushSize);
            break;
          case 'diamond':
            drawDiamond(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, false, brushSize);
            break;
          case 'star':
            drawStar(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, brushSize);
            break;
          case 'arrow':
            drawArrow(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, brushSize);
            break;
          case 'plus':
            drawPlus(temp, startPos.x, startPos.y, dragCurrentPos.x, dragCurrentPos.y, val, brushSize);
            break;
        }
        commitGridState(temp);
      }
    }

    setIsDrawing(false);
    setStartPos(null);
    setDragCurrentPos(null);

    // Clear move-drag refs; the floating selection remains until stamped (click outside)
    floatingSelDragStart.current = null;
    floatingSelOrigin.current = null;
    additiveSelectionBase.current = null;
  };

  // Zoom with mouse wheel centered at cursor
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.2 : 0.833;
    const nextZoom = Math.min(64, Math.max(2, Math.round(zoom * zoomFactor)));

    if (nextZoom !== zoom) {
      setPan({
        x: Math.round(mouseX - ((mouseX - pan.x) * nextZoom) / zoom),
        y: Math.round(mouseY - ((mouseY - pan.y) * nextZoom) / zoom),
      });
      setZoom(nextZoom);
    }
  };

  // Transformations
  const handleInvert = () => commitGridState(grid.invert());
  const handleFlipH = () => commitGridState(grid.flipH());
  const handleFlipV = () => commitGridState(grid.flipV());
  const handleRotate90 = () => commitGridState(grid.rotate90());

  // Export handlers
  const handleExportPNG = () => {
    const offscreen = document.createElement('canvas');
    offscreen.width = grid.width;
    offscreen.height = grid.height;
    const octx = offscreen.getContext('2d');
    if (!octx) return;

    octx.fillStyle = '#000000';
    octx.fillRect(0, 0, grid.width, grid.height);
    octx.fillStyle = '#ffffff';

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.get(x, y)) {
          octx.fillRect(x, y, 1, 1);
        }
      }
    }

    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pixel_art_${grid.width}x${grid.height}.png`;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  const handleExportCArray = () => {
    const cCode = grid.toCArray('CUSTOM_DISPLAY_BITMAP');
    setModalContent({ title: 'Export C 1bpp Array', text: cCode });
  };

  const handleExportJSON = () => {
    const json = JSON.stringify(
      {
        width: grid.width,
        height: grid.height,
        data: Array.from(grid.data),
      },
      null,
      2
    );
    setModalContent({ title: 'Export JSON', text: json });
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          const off = document.createElement('canvas');
          off.width = img.width;
          off.height = img.height;
          const octx = off.getContext('2d');
          if (!octx) return;
          octx.drawImage(img, 0, 0);
          const imgData = octx.getImageData(0, 0, img.width, img.height);
          const next = new BwpxGrid(img.width, img.height);
          for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
              const idx = (y * img.width + x) * 4;
              const brightness = (imgData.data[idx] + imgData.data[idx + 1] + imgData.data[idx + 2]) / 3;
              next.set(x, y, brightness > 128 ? 1 : 0);
            }
          }
          commitGridState(next);
          fitToView();
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target?.result as string);
          if (parsed.width && parsed.height && parsed.data) {
            const next = new BwpxGrid(parsed.width, parsed.height, parsed.data);
            commitGridState(next);
            fitToView();
          }
        } catch (err) {
          alert('Failed to parse file: ' + err);
        }
      };
      reader.readAsText(file);
    }
  };

  const handlePresetChange = (w: number, h: number) => {
    const next = new BwpxGrid(w, h);
    next.blit(grid, 0, 0);
    commitGridState(next);
    fitToView();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNotification(true);
    setTimeout(() => setCopiedNotification(false), 2000);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0f1013] text-[#e2e8f0] font-sans select-none overflow-hidden">
      {/* 1. TOP TOOLBAR (OLED Pixel Editor Style) */}
      <header className="flex items-center justify-between px-4 h-12 bg-[#16181d] border-b border-[#232730] z-20">
        {/* Left: App Title & History */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono-code font-bold text-sm tracking-wider text-[#00e5a3]">{title}</span>
          </div>

          <div className="h-4 w-[1px] bg-[#2d323d]" />

          {/* Undo / Redo */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={historyIndex <= 0}
              className={`p-1.5 rounded hover:bg-[#232730] transition ${historyIndex <= 0 ? 'opacity-30 cursor-not-allowed' : 'text-[#e2e8f0]'}`}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIndex >= history.length - 1}
              className={`p-1.5 rounded hover:bg-[#232730] transition ${historyIndex >= history.length - 1 ? 'opacity-30 cursor-not-allowed' : 'text-[#e2e8f0]'}`}
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-mono-code text-[#717d91] ml-1">
              {historyIndex} / {history.length - 1} steps
            </span>
          </div>

          <div className="h-4 w-[1px] bg-[#2d323d]" />

          {/* Brush Sizes */}
          <div className="flex items-center gap-1.5 bg-[#101216] px-2 py-1 rounded border border-[#232730]">
            <span className="text-[11px] font-mono-code text-[#717d91]">Brush</span>
            {[1, 2, 3, 4].map((sz) => (
              <button
                key={sz}
                onClick={() => setBrushSize(sz)}
                className={`w-6 h-6 rounded flex items-center justify-center font-mono-code text-xs transition ${
                  brushSize === sz ? 'bg-[#00e5a3] text-[#0f1013] font-bold shadow-sm' : 'text-[#717d91] hover:text-[#e2e8f0]'
                }`}
              >
                {sz}
              </button>
            ))}
          </div>

          <div className="h-4 w-[1px] bg-[#2d323d]" />

          {/* Transformations */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleInvert}
              className="px-2 py-1 text-xs font-mono-code rounded hover:bg-[#232730] text-[#717d91] hover:text-[#00e5a3] transition"
              title="Invert Colors"
            >
              Invert
            </button>
            <button
              onClick={handleFlipH}
              className="p-1.5 rounded hover:bg-[#232730] text-[#717d91] hover:text-[#e2e8f0] transition"
              title="Flip Horizontal"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>
            <button
              onClick={handleFlipV}
              className="p-1.5 rounded hover:bg-[#232730] text-[#717d91] hover:text-[#e2e8f0] transition"
              title="Flip Vertical"
            >
              <FlipVertical className="w-4 h-4" />
            </button>
            <button
              onClick={handleRotate90}
              className="p-1.5 rounded hover:bg-[#232730] text-[#717d91] hover:text-[#e2e8f0] transition"
              title="Rotate 90°"
            >
              <RotateCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Right: Export / Import & Presets */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-[#101216] px-1 py-0.5 rounded border border-[#232730]">
            <button
              onClick={handleExportPNG}
              className="px-2 py-1 text-xs font-mono-code text-[#717d91] hover:text-[#00e5a3] transition"
            >
              PNG
            </button>
            <button
              onClick={handleExportCArray}
              className="px-2 py-1 text-xs font-mono-code text-[#717d91] hover:text-[#00e5a3] transition"
            >
              C Array
            </button>
            <button
              onClick={handleExportJSON}
              className="px-2 py-1 text-xs font-mono-code text-[#717d91] hover:text-[#00e5a3] transition"
            >
              JSON
            </button>
          </div>

          <label className="cursor-pointer px-2.5 py-1 text-xs font-mono-code rounded bg-[#232730] hover:bg-[#2d323d] text-[#e2e8f0] flex items-center gap-1.5 transition">
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
            <input type="file" accept=".png,.bmp,.json" onChange={handleImportFile} className="hidden" />
          </label>

          {showPresets && (
            <div className="flex items-center gap-1 bg-[#101216] px-2 py-1 rounded border border-[#232730]">
              <span className="text-[11px] font-mono-code text-[#717d91]">Canvas</span>
              <select
                value={`${grid.width}x${grid.height}`}
                onChange={(e) => {
                  const [w, h] = e.target.value.split('x').map(Number);
                  handlePresetChange(w, h);
                }}
                className="bg-transparent text-xs font-mono-code text-[#00e5a3] outline-none cursor-pointer"
              >
                <option value="128x32" className="bg-[#16181d] text-[#e2e8f0]">128×32 (Corne HW)</option>
                <option value="32x128" className="bg-[#16181d] text-[#e2e8f0]">32×128 (Corne Portrait)</option>
                <option value="128x64" className="bg-[#16181d] text-[#e2e8f0]">128×64</option>
                <option value="128x34" className="bg-[#16181d] text-[#e2e8f0]">128×34 (Symbols Atlas)</option>
                <option value="128x22" className="bg-[#16181d] text-[#e2e8f0]">128×22 (Font Atlas)</option>
              </select>
            </div>
          )}

          <button
            onClick={fitToView}
            className="p-1.5 rounded hover:bg-[#232730] text-[#717d91] hover:text-[#e2e8f0] transition"
            title="Fit to Screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE (Left Tools Sidebar + Canvas) */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Toolbar (OLED Pixel Editor Style) */}
        <aside className="w-14 bg-[#16181d] border-r border-[#232730] flex flex-col items-center py-3 gap-4 z-10 overflow-y-auto">
          {/* DRAW GROUP */}
          <div className="flex flex-col items-center gap-1 w-full px-2">
            <span className="text-[9px] font-mono-code font-bold tracking-wider text-[#475569] mb-1">DRAW</span>

            {/* Pencil (Selectable) */}
            <button
              onClick={() => setActiveTool('pencil')}
              className={`w-9 h-9 rounded flex items-center justify-center transition ${
                activeTool === 'pencil' ? 'bg-[#00e5a3] text-[#0f1013] shadow-md' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
              }`}
              title="Pencil (Left click draws)"
            >
              <Pencil className="w-4 h-4" />
            </button>

            {/* Eraser (Fast action hint: Right-click) */}
            <div className="has-tooltip w-full flex justify-center">
              <button
                onClick={() => setActiveTool('eraser')}
                className={`w-9 h-9 rounded flex items-center justify-center transition ${
                  activeTool === 'eraser' ? 'bg-[#00e5a3] text-[#0f1013] shadow-md' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
                }`}
              >
                <Eraser className="w-4 h-4" />
              </button>
              <div className="tooltip left-12 top-1.5">Right-click to erase</div>
            </div>

            {/* Fill Bucket */}
            <button
              onClick={() => setActiveTool('bucket')}
              className={`w-9 h-9 rounded flex items-center justify-center transition ${
                activeTool === 'bucket' ? 'bg-[#00e5a3] text-[#0f1013] shadow-md' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
              }`}
              title="Flood Fill Bucket"
            >
              <PaintBucket className="w-4 h-4" />
            </button>

            {/* Selection (Fast action hint: Hold Shift) */}
            <div className="has-tooltip w-full flex justify-center">
              <button
                onClick={() => setActiveTool('select')}
                className={`w-9 h-9 rounded flex items-center justify-center transition ${
                  activeTool === 'select' ? 'bg-[#00e5a3] text-[#0f1013] shadow-md' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
                }`}
              >
                <MousePointer2 className="w-4 h-4" />
              </button>
              <div className="tooltip left-12 top-1.5">Hold Shift to select</div>
            </div>
          </div>

          <div className="w-8 h-[1px] bg-[#232730]" />

          {/* SHAPES GROUP */}
          <div className="flex flex-col items-center gap-1 w-full px-2">
            <span className="text-[9px] font-mono-code font-bold tracking-wider text-[#475569] mb-1">SHAPES</span>

            <button
              onClick={() => setActiveTool('line')}
              className={`w-9 h-9 rounded flex items-center justify-center transition ${
                activeTool === 'line' ? 'bg-[#00e5a3] text-[#0f1013]' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
              }`}
              title="Line"
            >
              <Minus className="w-4 h-4 transform -rotate-45" />
            </button>

            <button
              onClick={() => setActiveTool('rect')}
              className={`w-9 h-9 rounded flex items-center justify-center transition ${
                activeTool === 'rect' ? 'bg-[#00e5a3] text-[#0f1013]' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
              }`}
              title="Rectangle Outline"
            >
              <Square className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTool('filled-rect')}
              className={`w-9 h-9 rounded flex items-center justify-center transition ${
                activeTool === 'filled-rect' ? 'bg-[#00e5a3] text-[#0f1013]' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
              }`}
              title="Filled Rectangle"
            >
              <div className="w-3.5 h-3.5 bg-current rounded-sm" />
            </button>

            <button
              onClick={() => setActiveTool('ellipse')}
              className={`w-9 h-9 rounded flex items-center justify-center transition ${
                activeTool === 'ellipse' ? 'bg-[#00e5a3] text-[#0f1013]' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
              }`}
              title="Ellipse / Circle"
            >
              <Circle className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTool('filled-ellipse')}
              className={`w-9 h-9 rounded flex items-center justify-center transition ${
                activeTool === 'filled-ellipse' ? 'bg-[#00e5a3] text-[#0f1013]' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
              }`}
              title="Filled Circle"
            >
              <div className="w-3.5 h-3.5 bg-current rounded-full" />
            </button>

            <button
              onClick={() => setActiveTool('triangle')}
              className={`w-9 h-9 rounded flex items-center justify-center transition ${
                activeTool === 'triangle' ? 'bg-[#00e5a3] text-[#0f1013]' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
              }`}
              title="Triangle Outline"
            >
              <Triangle className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTool('filled-triangle')}
              className={`w-9 h-9 rounded flex items-center justify-center transition ${
                activeTool === 'filled-triangle' ? 'bg-[#00e5a3] text-[#0f1013]' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
              }`}
              title="Filled Triangle"
            >
              <Triangle className="w-4 h-4 fill-current" />
            </button>

            <button
              onClick={() => setActiveTool('star')}
              className={`w-9 h-9 rounded flex items-center justify-center transition ${
                activeTool === 'star' ? 'bg-[#00e5a3] text-[#0f1013]' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
              }`}
              title="5-Point Star"
            >
              <Sparkles className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTool('arrow')}
              className={`w-9 h-9 rounded flex items-center justify-center transition ${
                activeTool === 'arrow' ? 'bg-[#00e5a3] text-[#0f1013]' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
              }`}
              title="Arrow"
            >
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => setActiveTool('plus')}
              className={`w-9 h-9 rounded flex items-center justify-center transition ${
                activeTool === 'plus' ? 'bg-[#00e5a3] text-[#0f1013]' : 'text-[#717d91] hover:bg-[#232730] hover:text-[#e2e8f0]'
              }`}
              title="Cross / Plus"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </aside>

        {/* Center Canvas Viewport */}
        <main
          ref={containerRef}
          className="flex-1 h-full bg-[#0f1013] overflow-hidden relative cursor-crosshair"
          onContextMenu={(e) => e.preventDefault()}
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              setHoverPos(null);
              setIsDrawing(false);
              setIsPanning(false);
            }}
            onWheel={handleWheel}
            className="w-full h-full block"
          />
        </main>
      </div>

      {/* 3. BOTTOM STATUS BAR (OLED Pixel Editor Style) */}
      <footer className="h-7 bg-[#16181d] border-t border-[#232730] px-4 flex items-center justify-between text-xs font-mono-code text-[#717d91] z-20">
        <div className="flex items-center gap-4">
          <span className="text-[#00e5a3] font-bold uppercase">{activeTool}</span>
          <span>
            Pos:{' '}
            <strong className="text-[#e2e8f0]">
              {hoverPos && grid.inBounds(hoverPos.x, hoverPos.y) ? `${hoverPos.x}, ${hoverPos.y}` : '--'}
            </strong>
          </span>
          <span>
            Brush: <strong className="text-[#e2e8f0]">{brushSize}px</strong>
          </span>
          <span>
            Size: <strong className="text-[#e2e8f0]">{grid.width}×{grid.height}</strong>
          </span>
          <span>
            Selection:{' '}
            <strong className="text-[#e2e8f0]">
              {selection && selection.active ? `${selection.w}×${selection.h}` : 'None'}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <span>
            On: <strong className="text-[#00e5a3]">{grid.countOn()}</strong>
          </span>
          <span>
            Zoom: <strong className="text-[#e2e8f0]">{zoom * 100}%</strong>
          </span>
        </div>
      </footer>

      {/* Export Modal */}
      {modalContent && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#16181d] border border-[#232730] rounded-lg shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#232730]">
              <h3 className="font-mono-code font-bold text-sm text-[#00e5a3] flex items-center gap-2">
                <FileCode className="w-4 h-4" />
                {modalContent.title}
              </h3>
              <button
                onClick={() => setModalContent(null)}
                className="text-[#717d91] hover:text-[#e2e8f0] text-sm font-bold"
              >
                ✕
              </button>
            </div>
            <pre className="p-4 bg-[#0f1013] text-[#e2e8f0] font-mono-code text-xs overflow-auto max-h-96 whitespace-pre">
              {modalContent.text}
            </pre>
            <div className="flex items-center justify-between px-4 py-3 bg-[#13151a] border-t border-[#232730]">
              <span className="text-xs font-mono-code text-[#717d91]">Ready to copy into your project header</span>
              <div className="flex gap-2">
                <button
                  onClick={() => copyToClipboard(modalContent.text)}
                  className="px-3 py-1.5 text-xs font-mono-code rounded bg-[#00e5a3] text-[#0f1013] font-bold flex items-center gap-1.5 hover:bg-[#10f0b0] transition"
                >
                  {copiedNotification ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedNotification ? 'Copied!' : 'Copy to Clipboard'}
                </button>
                <button
                  onClick={() => setModalContent(null)}
                  className="px-3 py-1.5 text-xs font-mono-code rounded bg-[#232730] hover:bg-[#2d323d] text-[#e2e8f0] transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
