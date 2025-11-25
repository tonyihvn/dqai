import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { fabric } from 'fabric';

type FabricCanvasProps = {
    width?: number;
    height?: number;
    paperSize?: string;
    orientation?: 'portrait' | 'landscape';
    margins?: { top?: number; right?: number; bottom?: number; left?: number };
    initialSvg?: string;
    onSelect?: (obj: any | null) => void;
    onDoubleClick?: (obj: any | null, left?: number, top?: number) => void;
    gridSize?: number;
    gridEnabled?: boolean;
};

const FabricCanvas = forwardRef(function FabricCanvasInner({ width = 800, height = 1120, paperSize = 'A4', orientation = 'portrait', margins = {}, initialSvg, onSelect }: FabricCanvasProps, ref) {
    const canvasEl = useRef<HTMLCanvasElement | null>(null);
    const canvasRef = useRef<fabric.Canvas | null>(null);

    useEffect(() => {
        if (!canvasEl.current) return;
        const c = new fabric.Canvas(canvasEl.current, {
            backgroundColor: '#ffffff',
            selection: true,
            preserveObjectStacking: true,
            renderOnAddRemove: true
        });
        canvasRef.current = c;

        // basic selection handlers
        c.on('selection:created', (e) => { onSelect && onSelect(e.target as any); });
        c.on('selection:updated', (e) => { onSelect && onSelect(e.target as any); });
        c.on('selection:cleared', () => { onSelect && onSelect(null); });

        // double-click detection (fabric may not reliably emit dblclick across builds)
        let lastDown = 0;
        c.on('mouse:down', (opt) => {
            const now = Date.now();
            const delta = now - lastDown;
            lastDown = now;
            if (delta < 350) {
                const t = opt.target as any;
                if (t) {
                    try { onDoubleClick && onDoubleClick(t, t.left, t.top); } catch (e) { }
                }
            }
        });

        // load initial SVG if provided
        if (initialSvg) {
            try {
                fabric.loadSVGFromString(initialSvg, (objects, options) => {
                    const obj = fabric.util.groupSVGElements(objects, options);
                    obj.set({ left: 0, top: 0, selectable: false });
                    c.add(obj);
                    c.requestRenderAll();
                });
            } catch (e) { console.warn('Failed to load initial SVG', e); }
        }

        const resize = () => {
            c.setWidth(width);
            c.setHeight(height);
            c.calcOffset();
            c.requestRenderAll();
        };
        resize();

        return () => {
            try { c.dispose && c.dispose(); } catch (e) { }
            canvasRef.current = null;
        };
    }, []);

    useImperativeHandle(ref, () => ({
        addTextbox: (text: string, opts: any = {}) => {
            const c = canvasRef.current; if (!c) return null;
            const box = new fabric.Textbox(text || 'Text', {
                left: opts.left ?? 40,
                top: opts.top ?? 40,
                width: opts.width ?? 200,
                fontSize: opts.fontSize ?? 14,
                fill: opts.fill ?? '#111827',
                editable: true
            });
            c.add(box);
            // attach an internal id for referencing later
            try { (box as any).customId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; } catch (e) { }
            c.setActiveObject(box);
            c.requestRenderAll();
            return box;
        },
        addImageFromUrl: (url: string, opts: any = {}) => {
            const c = canvasRef.current; if (!c) return null;
            fabric.Image.fromURL(url, (img) => {
                img.set({ left: opts.left ?? 40, top: opts.top ?? 40, scaleX: opts.scaleX ?? 1, scaleY: opts.scaleY ?? 1 });
                c.add(img);
                c.setActiveObject(img);
                c.requestRenderAll();
            }, { crossOrigin: 'anonymous' });
        },
        addTable: (rows: string[][], opts: any = {}) => {
            const c = canvasRef.current; if (!c) return null;
            const cellW = opts.cellWidth ?? 120;
            const cellH = opts.cellHeight ?? 32;
            const objs: fabric.Object[] = [];
            for (let r = 0; r < rows.length; r++) {
                for (let col = 0; col < rows[r].length; col++) {
                    const left = (col * cellW) + (opts.left ?? 40);
                    const top = (r * cellH) + (opts.top ?? 40);
                    const rect = new fabric.Rect({ left, top, width: cellW, height: cellH, fill: '#fff', stroke: '#e5e7eb', selectable: false });
                    const txt = new fabric.Textbox(rows[r][col] || '', { left: left + 6, top: top + 6, width: cellW - 12, fontSize: 12, selectable: true, editable: true, fill: '#111827' });
                    objs.push(rect);
                    objs.push(txt);
                }
            }
            const group = new fabric.Group(objs, { left: opts.left ?? 40, top: opts.top ?? 40, selectable: true });
            c.add(group);
            c.setActiveObject(group);
            c.requestRenderAll();
            try { (group as any).customId = `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`; } catch (e) { }
            return group;
        },
        // update selected object's text (simple plain-text replacement)
        updateSelectedText: (newText: string) => {
            const c = canvasRef.current; if (!c) return null;
            const obj: any = c.getActiveObject(); if (!obj) return null;
            try {
                if (obj.set) { obj.set('text', newText); }
                else if (obj.setText) { obj.setText(newText); }
                obj.setCoords && obj.setCoords();
                c.requestRenderAll();
            } catch (e) { console.warn('Failed to update object text', e); }
            return obj;
        },
        getCombinedHtml: () => {
            const c = canvasRef.current; if (!c) return '';
            try {
                const svg = c.toSVG();
                return `<div class=\"fabric-canvas-export\" dir=\"ltr\">${svg}</div>`;
            } catch (e) { return '' + (c.toDataURL ? c.toDataURL() : ''); }
        },
        toSVG: () => { const c = canvasRef.current; if (!c) return ''; return c.toSVG(); },
        toJSON: () => { const c = canvasRef.current; if (!c) return null; return c.toJSON(); },
        removeSelected: () => { const c = canvasRef.current; if (!c) return; const obj = c.getActiveObject(); if (obj) { c.remove(obj); c.requestRenderAll(); } },
        exportAsBlob: async () => {
            const c = canvasRef.current; if (!c) return null;
            const svg = c.toSVG();
            const blob = new Blob([svg], { type: 'image/svg+xml' });
            return blob;
        }
    } as any), []);

    return (
        <div style={{ width: width, height: height, background: '#fff' }} className="fabric-canvas-root">
            <canvas ref={canvasEl} width={width} height={height} />
        </div>
    );
});

export default FabricCanvas;
