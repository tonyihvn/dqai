import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import WysiwygEditor from './WysiwygEditor';

type Props = {
  value?: string;
  onChange?: (html: string) => void;
  className?: string;
  paperSize?: string;
  orientation?: 'portrait' | 'landscape';
  margins?: { top?: number; right?: number; bottom?: number; left?: number };
  onSelect?: (block: any | null) => void;
  showToolbox?: boolean;
  showInspector?: boolean;
};
// Canvas-style editor with a small toolbox and inspector. Supports positioned draggable blocks.
const CanvasEditor = forwardRef(function CanvasEditorInner({ value = '', onChange, className, paperSize = 'A4', orientation = 'portrait', margins = {}, onSelect, showToolbox = true, showInspector = true }: Props, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [internalHtml, setInternalHtml] = useState<string>(value || '');
  const [blocks, setBlocks] = useState<Array<any>>([]);
  const [history, setHistory] = useState<Array<{ html: string; blocks: any[] }>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const blocksRef = useRef<Array<any>>(blocks);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [textModalHtml, setTextModalHtml] = useState('');
  const [insertAsBlock, setInsertAsBlock] = useState(false);
  const [selectedPlaceholder, setSelectedPlaceholder] = useState<HTMLElement | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);

  const propsOnSelect = (b: any | null) => { if (onSelect) onSelect(b); };

  // ensure emitChange and insertHtmlAtCursor are declared before useImperativeHandle
  const emitChange = () => {
    // combine internalHtml with positioned blocks as wrapper divs
    const containerHtml = internalHtml || (containerRef.current ? containerRef.current.innerHTML : '') || '';
    let combined = containerHtml || '';
    for (const b of blocks) {
      try {
        const meta = { ...(b.meta || {}), left: b.left, top: b.top, width: b.width, height: b.height, html: b.html };
        const safe = JSON.stringify(meta).replace(/</g, '&lt;');
        combined += `<div class="tpl-block" data-block-id="${b.id}" data-block-json='${safe}' style="position:absolute; left:${b.left}px; top:${b.top}px">${b.html}</div>`;
      } catch (e) { /* ignore */ }
    }
    setInternalHtml(containerHtml || '');
    onChange && onChange(combined || '');
    // push snapshot to history (blocks + html)
    try {
      const snap = { html: containerHtml || '', blocks: JSON.parse(JSON.stringify(blocks || [])) };
      setHistory(h => {
        const next = h.slice(0, historyIndex + 1);
        next.push(snap);
        // limit history to 50
        if (next.length > 50) next.shift();
        return next;
      });
      setHistoryIndex(i => Math.min(historyIndex + 1, 49));
    } catch (e) { /* ignore history errors */ }
  };

  const insertHtmlAtCursor = (html: string) => {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) {
      if (containerRef.current) containerRef.current.insertAdjacentHTML('beforeend', html);
      emitChange();
      return;
    }
    const range = sel.getRangeAt(0);
    if (!containerRef.current || !containerRef.current.contains(range.commonAncestorContainer)) {
      containerRef.current?.insertAdjacentHTML('beforeend', html);
      emitChange();
      return;
    }
    const el = document.createElement('div'); el.innerHTML = html;
    const frag = document.createDocumentFragment();
    let node; while ((node = el.firstChild)) frag.appendChild(node);
    range.deleteContents();
    range.insertNode(frag);
    // collapse selection after insertion
    sel.removeAllRanges();
    const newRange = document.createRange();
    newRange.setStart(range.endContainer || containerRef.current!, range.endOffset || 0);
    newRange.collapse(true);
    sel.addRange(newRange);
    emitChange();
  };

  // expose imperative API so parent can call toolbox actions when toolbox is moved
  useImperativeHandle(ref, () => ({
    insertTextBlock: () => { setInsertAsBlock(false); setTextModalHtml('<p><em>Double-click to edit</em></p>'); setIsTextModalOpen(true); },
    insertBlock: (opts?: { html?: string; left?: number; top?: number }) => {
      if (opts && opts.html) {
        insertBlockAt(opts.html, opts.left || 40, opts.top || 40);
        return;
      }
      setInsertAsBlock(true); setTextModalHtml('<p><em>Block: Double-click to edit</em></p>'); setIsTextModalOpen(true);
    },
    insertPlaceholder: async () => { const id = window.prompt('Question ID to reference (e.g. 123)'); if (!id) return; const lbl = window.prompt('Placeholder label', `Question ${id}`) || `Question ${id}`; const safeLabel = String(lbl).replace(/</g, '&lt;'); insertHtmlAtCursor(`<span class="tpl-placeholder" contenteditable="false" data-qid="${id}" data-label="${safeLabel}" style="background:#eef2ff;border:1px dashed #c7d2fe;padding:2px 6px;border-radius:3px;margin:0 4px;display:inline-block;cursor:move;">${safeLabel}</span>`); },
    insertImageUrl: async () => { const url = window.prompt('Image URL'); if (!url) return; insertHtmlAtCursor(`<img src="${url}" style="max-width:100%;cursor:move;"/>`); },
    insertHtml: (html: string) => { if (!html) return; insertHtmlAtCursor(html); },
    zoomIn: () => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2))),
    zoomOut: () => setZoom(z => Math.max(0.25, +(z - 0.1).toFixed(2))),
    undo: () => undo(),
    redo: () => redo()
  } as any), [insertHtmlAtCursor]);

  // undo/redo
  const undo = () => {
    if (historyIndex <= 0) return;
    const ni = historyIndex - 1;
    const snap = history[ni];
    if (!snap) return;
    setBlocks(snap.blocks || []);
    setInternalHtml(snap.html || '');
    setHistoryIndex(ni);
    // emit change to parent
    setTimeout(() => {
      const combined = (snap.html || '') + (snap.blocks || []).map((b: any) => `<div class="tpl-block" data-block-id="${b.id}" data-block-json='${JSON.stringify(b.meta || {})}' style="position:absolute; left:${b.left}px; top:${b.top}px">${b.html}</div>`).join('');
      onChange && onChange(combined);
    }, 20);
  };
  const redo = () => {
    if (historyIndex >= history.length - 1) return;
    const ni = historyIndex + 1;
    const snap = history[ni];
    if (!snap) return;
    setBlocks(snap.blocks || []);
    setInternalHtml(snap.html || '');
    setHistoryIndex(ni);
    setTimeout(() => {
      const combined = (snap.html || '') + (snap.blocks || []).map((b: any) => `<div class="tpl-block" data-block-id="${b.id}" data-block-json='${JSON.stringify(b.meta || {})}' style="position:absolute; left:${b.left}px; top:${b.top}px">${b.html}</div>`).join('');
      onChange && onChange(combined);
    }, 20);
  };

  useEffect(() => { if (value !== internalHtml) setInternalHtml(value || ''); }, [value]);

  // keep a ref of blocks for event handlers that run outside React render cycle
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  // parse positioned blocks from incoming HTML value
  useEffect(() => {
    if (!value) { setBlocks([]); return; }
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(value, 'text/html');
      const found: any[] = [];
      const blockEls = Array.from(doc.querySelectorAll('div.tpl-block[data-block-id]'));
      for (const be of blockEls) {
        try {
          const id = be.getAttribute('data-block-id') || `b_${Date.now()}`;
          const raw = be.getAttribute('data-block-json') || '{}';
          const meta = JSON.parse(raw || '{}');
          const style = be.getAttribute('style') || '';
          const mLeft = style.match(/left:\s*([0-9.]+)px/);
          const mTop = style.match(/top:\s*([0-9.]+)px/);
          const left = mLeft ? Number(mLeft[1]) : (meta.left || 20);
          const top = mTop ? Number(mTop[1]) : (meta.top || 20);
          found.push({ id, html: be.innerHTML || meta.html || '', left, top, width: meta.width || null, height: meta.height || null, meta });
        } catch (e) { /* ignore */ }
      }
      // remove block wrappers from remaining html
      blockEls.forEach(el => el.remove());
      const remaining = doc.body ? doc.body.innerHTML : '';
      setInternalHtml(remaining || '');
      setBlocks(found);
    } catch (e) {
      // ignore parse errors
    }
  }, [value]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      // If clicked a placeholder, emit a structured selection object
      const placeholder = target.closest && (target.closest('.tpl-placeholder') as HTMLElement | null);
      if (placeholder) {
        setSelectedPlaceholder(placeholder as HTMLElement);
        const obj = { id: null, type: 'placeholder', html: placeholder.outerHTML, left: null, top: null, meta: { label: placeholder.getAttribute('data-label'), qid: placeholder.getAttribute('data-qid'), activityField: placeholder.getAttribute('data-activity-field') } };
        propsOnSelect && propsOnSelect(obj);
        return;
      }
      // If clicked a positioned block, find it in state and emit its data
      const blockEl = target.closest && (target.closest('.tpl-block') as HTMLElement | null);
      if (blockEl) {
        const bid = blockEl.getAttribute('data-block-id');
        if (bid) {
          setSelectedBlockId(bid);
          const found = blocks.find(b => String(b.id) === String(bid));
          const obj = found ? { ...found } : { id: bid, html: blockEl.innerHTML, left: null, top: null, meta: {} };
          propsOnSelect && propsOnSelect(obj);
          return;
        }
      }
      setSelectedPlaceholder(null);
      setSelectedBlockId(null);
      propsOnSelect && propsOnSelect(null);
    };

    // Convert placeholders/images to blocks only after movement threshold to avoid duplicates on click
    const potentialDrag = { target: null as HTMLElement | null, startX: 0, startY: 0, moved: false };
    let watching = false;

    const onPointerDown = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const placeholder = target.closest && (target.closest('.tpl-placeholder') as HTMLElement | null);
      const img = target.tagName === 'IMG' ? target as HTMLImageElement : (target.closest && (target.closest('img') as HTMLImageElement | null));
      if (!placeholder && !(img && containerRef.current && containerRef.current.contains(img))) return;
      potentialDrag.target = (placeholder as HTMLElement) || (img as HTMLElement);
      potentialDrag.startX = ev.clientX; potentialDrag.startY = ev.clientY; potentialDrag.moved = false;
      if (watching) return;
      watching = true;

      const onDocMove = (me: MouseEvent) => {
        if (!potentialDrag.target) return;
        const dx = Math.abs(me.clientX - potentialDrag.startX);
        const dy = Math.abs(me.clientY - potentialDrag.startY);
        if (!potentialDrag.moved && (dx > 6 || dy > 6)) {
          potentialDrag.moved = true;
          try { elementToBlockAndDrag(potentialDrag.target as HTMLElement, me.clientX, me.clientY); } catch (e) { console.error(e); }
          cleanup();
        }
      };

      const onDocUp = () => { cleanup(); };

      const cleanup = () => {
        document.removeEventListener('mousemove', onDocMove);
        document.removeEventListener('mouseup', onDocUp);
        potentialDrag.target = null; watching = false;
      };

      document.addEventListener('mousemove', onDocMove);
      document.addEventListener('mouseup', onDocUp);
    };

    el.addEventListener('click', handler);
    el.addEventListener('mousedown', onPointerDown);
    return () => {
      el.removeEventListener('click', handler);
      el.removeEventListener('mousedown', onPointerDown);
    };
  }, [propsOnSelect]);

  // toolbox handlers
  const handleInsertTextBlock = () => {
    setInsertAsBlock(false);
    setTextModalHtml('<p><em>Double-click to edit</em></p>');
    setIsTextModalOpen(true);
  };
  const handleInsertImageUrl = async () => {
    const url = window.prompt('Image URL'); if (!url) return; insertHtmlAtCursor(`<img src="${url}" style="max-width:100%"/>`);
  };
  const handleInsertPlaceholder = () => {
    const id = window.prompt('Question ID to reference (e.g. 123)'); if (!id) return; const lbl = window.prompt('Placeholder label', `Question ${id}`) || `Question ${id}`; const safeLabel = String(lbl).replace(/</g, '&lt;'); insertHtmlAtCursor(`<span class="tpl-placeholder" contenteditable="false" data-qid="${id}" data-label="${safeLabel}" style="background:#eef2ff;border:1px dashed #c7d2fe;padding:2px 6px;border-radius:3px;margin:0 4px;display:inline-block">${safeLabel}</span>`);
  };

  const insertBlockAt = (htmlContent: string, left = 40, top = 40) => {
    const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const b = { id, html: htmlContent, left, top, width: null, height: null, meta: {} };
    setBlocks(prev => { const next = [...prev, b]; return next; });
    setTimeout(() => emitChange(), 50);
  };

  const handleInsertBlock = () => {
    setInsertAsBlock(true);
    setTextModalHtml('<p><em>Block: Double-click to edit</em></p>');
    setIsTextModalOpen(true);
  };

  // drag/move for blocks
  const startDragBlock = (ev: React.MouseEvent, blockId: string) => {
    ev.preventDefault(); ev.stopPropagation();
    const startX = ev.clientX; const startY = ev.clientY;
    const bIndex = blocks.findIndex(b => b.id === blockId);
    if (bIndex === -1) return;
    const startBlock = blocks[bIndex];
    const origLeft = startBlock.left; const origTop = startBlock.top;
    const onMove = (me: MouseEvent) => {
      const dx = (me.clientX - startX) / zoom;
      const dy = (me.clientY - startY) / zoom;
      setBlocks(prev => {
        const copy = prev.slice();
        copy[bIndex] = { ...copy[bIndex], left: Math.max(0, Math.round(origLeft + dx)), top: Math.max(0, Math.round(origTop + dy)) };
        return copy;
      });
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); setTimeout(() => emitChange(), 50); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // helper to begin dragging a block by id using a given start mouse position
  const beginDrag = (blockId: string, startX: number, startY: number) => {
    const bIndex = blocksRef.current.findIndex(b => b.id === blockId);
    if (bIndex === -1) return;
    const startBlock = blocksRef.current[bIndex];
    const origLeft = startBlock.left; const origTop = startBlock.top;
    const onMove = (me: MouseEvent) => {
      const dx = (me.clientX - startX) / zoom;
      const dy = (me.clientY - startY) / zoom;
      setBlocks(prev => {
        const copy = prev.slice();
        const idx = copy.findIndex(x => x.id === blockId);
        if (idx === -1) return copy;
        copy[idx] = { ...copy[idx], left: Math.max(0, Math.round(origLeft + dx)), top: Math.max(0, Math.round(origTop + dy)) };
        return copy;
      });
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); setTimeout(() => emitChange(), 50); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Convert certain inline elements (placeholders, images) into positioned blocks and start dragging them
  const elementToBlockAndDrag = (el: HTMLElement, clientX: number, clientY: number) => {
    try {
      const paperRoot = containerRef.current ? (containerRef.current.closest('.paper-root') as HTMLElement | null) : null;
      const rootRect = paperRoot ? paperRoot.getBoundingClientRect() : { left: 0, top: 0 };
      const left = Math.max(0, Math.round((clientX - rootRect.left) / zoom));
      const top = Math.max(0, Math.round((clientY - rootRect.top) / zoom));
      // capture outerHTML and remove from editable content
      const html = el.outerHTML;
      // remove element from DOM and update internalHtml to avoid duplication when emitting combined HTML
      el.remove();
      // sync internalHtml with current DOM
      try { setInternalHtml(containerRef.current ? containerRef.current.innerHTML : ''); } catch (e) { /* ignore */ }
      const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newBlock = { id, html, left, top, width: null, height: null, meta: {} };
      setBlocks(prev => {
        const next = [...prev, newBlock];
        // start dragging slightly after state update so block exists in DOM
        setTimeout(() => {
          // ensure the change is emitted so the parent doesn't re-insert the removed element
          try { emitChange(); } catch (e) { /* ignore */ }
          beginDrag(id, clientX, clientY);
        }, 20);
        return next;
      });
    } catch (e) { console.error('Failed to convert element to block', e); }
  };

  // handle drops from outside (e.g., dragging a question or table header) and files (images)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    // If files are dropped (images), insert as positioned blocks at drop location
    try {
      const files = Array.from(e.dataTransfer.files || []);
      if (files.length > 0) {
        const paperRoot = containerRef.current ? (containerRef.current.closest('.paper-root') as HTMLElement | null) : null;
        const rootRect = paperRoot ? paperRoot.getBoundingClientRect() : { left: 0, top: 0 };
        const clientX = (e.nativeEvent as any).clientX || 0;
        const clientY = (e.nativeEvent as any).clientY || 0;
        const left = Math.max(0, Math.round((clientX - rootRect.left) / zoom));
        const top = Math.max(0, Math.round((clientY - rootRect.top) / zoom));
        for (const f of files) {
          if (!f.type.startsWith('image/')) continue;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            const html = `<img src="${dataUrl}" style="max-width:100%" />`;
            insertBlockAt(html, left, top);
          };
          reader.readAsDataURL(f);
        }
        return;
      }
    } catch (e) { /* ignore */ }

    // prefer HTML payload
    const html = e.dataTransfer.getData('text/html') || e.dataTransfer.getData('text/plain') || '';
    if (html) {
      insertHtmlAtCursor(html);
      return;
    }
    // fallback: other types could be handled here
  };

  // render computed styles for paper size/orientation/margins
  const paperMm: Record<string, { w: number; h: number }> = { A4: { w: 210, h: 297 }, Letter: { w: 216, h: 279 }, A3: { w: 297, h: 420 } };
  const mm = paperMm[paperSize] || paperMm['A4'];
  const physW = orientation === 'landscape' ? mm.h : mm.w;
  const physH = orientation === 'landscape' ? mm.w : mm.h;
  const pxPerMm = 96 / 25.4;
  const widthPx = Math.round(physW * pxPerMm);
  const heightPx = Math.round(physH * pxPerMm);
  const padTop = (margins.top || 20);
  const padRight = (margins.right || 20);
  const padBottom = (margins.bottom || 20);
  const padLeft = (margins.left || 20);

  return (
    <div className={`flex gap-3 items-start ${className || ''}`}>
      {showToolbox && (
        <div className="w-28">
          <div className="space-y-2">
            <div className="text-xs font-medium">Toolbox</div>
            <button className="w-full p-2 border rounded text-sm" onClick={handleInsertTextBlock}>Text</button>
            <button className="w-full p-2 border rounded text-sm" onClick={handleInsertBlock}>Block</button>
            <button className="w-full p-2 border rounded text-sm" onClick={handleInsertPlaceholder}>Placeholder</button>
            <button className="w-full p-2 border rounded text-sm" onClick={handleInsertImageUrl}>Image</button>
            <div className="mt-2 flex gap-2">
              <button className="flex-1 p-2 border rounded text-sm" onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2)))}>Zoom +</button>
              <button className="flex-1 p-2 border rounded text-sm" onClick={() => setZoom(z => Math.max(0.25, +(z - 0.1).toFixed(2)))}>Zoom -</button>
            </div>
            <div className="mt-3 text-xs">Paper</div>
            <div className="text-xs text-gray-500">{paperSize} · {orientation}</div>
            <div className="text-xs text-gray-500">{Math.round(physW)}mm × {Math.round(physH)}mm</div>
            <div className="mt-3 text-xs">Margins (px)</div>
            <div className="grid grid-cols-2 gap-1">
              <input className="border p-1 text-xs" placeholder="Top" value={String(margins.top ?? '')} onChange={() => { /* read-only here; controlled via parent if needed */ }} />
              <input className="border p-1 text-xs" placeholder="Left" value={String(margins.left ?? '')} onChange={() => { }} />
            </div>
          </div>
        </div>
      )}
      <div style={{ minWidth: Math.round(widthPx * zoom), display: 'flex', justifyContent: 'center' }} className="border shadow-sm bg-white relative flex-1 overflow-auto" >
        {/* rulers (simple) */}
        <div className="absolute left-0 top-0 right-0 h-6 bg-gray-100 border-b z-20 flex items-center" style={{ transform: `scale(${zoom})`, transformOrigin: 'left top' }}>
          <div className="ml-2 text-xs text-gray-600">{paperSize} — {Math.round(physW)}mm</div>
        </div>
        <div style={{ padding: `${padTop}px ${padRight}px ${padBottom}px ${padLeft}px`, minHeight: 220 }}>
          <div style={{ width: widthPx, height: heightPx, position: 'relative', overflow: 'hidden', transform: `scale(${zoom})`, transformOrigin: 'left top', background: '#fff' }} className="paper-root shadow-inner">
            <div
              ref={containerRef}
              className={`canvas-editor`}
              contentEditable
              suppressContentEditableWarning
              onInput={emitChange}
              onBlur={emitChange}
              onDrop={onDrop}
              onDragOver={e => e.preventDefault()}
              style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                backgroundImage: 'linear-gradient(#f7fafc 1px, transparent 1px), linear-gradient(90deg, #f7fafc 1px, transparent 1px)',
                backgroundSize: `${20 * zoom}px ${20 * zoom}px, ${20 * zoom}px ${20 * zoom}px`,
                backgroundPosition: '0 0, 0 0',
                minHeight: 200,
                direction: 'ltr',
                unicodeBidi: 'embed'
              }}
            >
              <div dangerouslySetInnerHTML={{ __html: internalHtml }} />
              {/* positioned blocks */}
              {blocks.map(b => (
                <div key={b.id} className={`tpl-block`} data-block-id={b.id} data-block-json={JSON.stringify(b.meta || {})} style={{ position: 'absolute', left: b.left + 'px', top: b.top + 'px', cursor: 'move', border: selectedBlockId === b.id ? '1px solid #2563eb' : '1px dashed rgba(0,0,0,0.08)', padding: 4, background: '#fff' }}
                  onMouseDown={(ev) => startDragBlock(ev as any, b.id)} onDoubleClick={() => { /* optionally open editor */ }} onClick={(e) => { e.stopPropagation(); setSelectedBlockId(b.id); propsOnSelect && propsOnSelect({ ...b }); }} dangerouslySetInnerHTML={{ __html: b.html }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      {showInspector && (
        <div className="w-48">
          <div className="text-xs font-medium">Inspector</div>
          <div className="mt-2 text-xs text-gray-500">Selection</div>
          <div className="mt-2 text-xs">
            {selectedBlockId ? (() => {
              const b = blocks.find(x => x.id === selectedBlockId);
              if (!b) return <div className="text-xs text-gray-500">No selection</div>;
              return (
                <div>
                  <div className="mb-2">
                    <label className="block text-xs text-gray-500">Left (px)</label>
                    <input className="w-full border p-1 text-sm" value={String(b.left)} onChange={e => setBlocks(prev => prev.map(x => x.id === b.id ? { ...x, left: Number(e.target.value || 0) } : x))} />
                  </div>
                  <div className="mb-2">
                    <label className="block text-xs text-gray-500">Top (px)</label>
                    <input className="w-full border p-1 text-sm" value={String(b.top)} onChange={e => setBlocks(prev => prev.map(x => x.id === b.id ? { ...x, top: Number(e.target.value || 0) } : x))} />
                  </div>
                  <div className="mb-2">
                    <label className="block text-xs text-gray-500">Inner HTML</label>
                    <textarea className="w-full border p-1 text-sm" rows={4} value={b.html} onChange={e => setBlocks(prev => prev.map(x => x.id === b.id ? { ...x, html: e.target.value } : x))} />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button className="p-1 border rounded text-xs" onClick={() => {
                      // remove block
                      setBlocks(prev => prev.filter(x => x.id !== b.id));
                      setSelectedBlockId(null);
                      setTimeout(() => emitChange(), 40);
                    }}>Remove</button>
                    <button className="p-1 bg-primary-600 text-white rounded text-xs" onClick={() => { setTimeout(() => emitChange(), 40); }}>Save</button>
                  </div>
                </div>
              );
            })() : <div className="text-xs text-gray-500">Click an object to view/edit properties</div>}
          </div>
        </div>
      )}

      {/* Text editing modal (TinyMCE/Wysiwyg) */}
      {isTextModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white w-3/4 p-4 rounded shadow-lg">
            <div className="flex justify-between items-center mb-2"><div className="font-medium">Insert Text</div><button onClick={() => setIsTextModalOpen(false)}>Close</button></div>
            <div style={{ minHeight: 200 }}>
              <WysiwygEditor value={textModalHtml} onChange={v => setTextModalHtml(v)} />
            </div>
            <div className="flex justify-end gap-2 mt-2">
              <button className="p-2 border rounded" onClick={() => setIsTextModalOpen(false)}>Cancel</button>
              <button className="p-2 bg-primary-600 text-white rounded" onClick={() => {
                if (insertAsBlock) insertBlockAt(textModalHtml, 40, 40); else insertHtmlAtCursor(textModalHtml);
                setIsTextModalOpen(false);
              }}>Insert</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default CanvasEditor;
