import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { apiFetch } from '../../utils/api';
import WysiwygEditor from './WysiwygEditor';

type Props = {
  value?: string;
  initialBlocks?: any[];
  onChange?: (state: any) => void;
  className?: string;
  paperSize?: string;
  orientation?: 'portrait' | 'landscape';
  margins?: { top?: number; right?: number; bottom?: number; left?: number };
  onSelect?: (block: any | null) => void;
  onUploadedDocUpdated?: (doc: any) => void;
  showToolbox?: boolean;
  showInspector?: boolean;
  useFabric?: boolean;
};
// Canvas-style editor with a small toolbox and inspector. Supports positioned draggable blocks.
const CanvasEditor = forwardRef(function CanvasEditorInner({ value = '', initialBlocks = [], onChange, className, paperSize = 'A4', orientation = 'portrait', margins = {}, onSelect, onUploadedDocUpdated, showToolbox = true, showInspector = true, useFabric = false }: Props, ref) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [internalHtml, setInternalHtml] = useState<string>(value || '');
  const [blocks, setBlocks] = useState<Array<any>>([]);
  const [history, setHistory] = useState<Array<{ html: string; blocks: any[] }>>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const blocksRef = useRef<Array<any>>(blocks);
  // short-lived lock timestamp (ms epoch). When a local edit occurs we set this to Date.now()+lockMs
  // to avoid being clobbered by stale parent updates arriving a tiny bit later.
  const localChangeLockRef = useRef<number>(0);
  const isFocusedRef = useRef(false);
  const [isTextModalOpen, setIsTextModalOpen] = useState(false);
  const [textModalHtml, setTextModalHtml] = useState('');
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [insertAsBlock, setInsertAsBlock] = useState(false);
  const [selectedPlaceholder, setSelectedPlaceholder] = useState<HTMLElement | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  // track elements already converted to blocks to avoid duplicate conversions during drag
  const convertedElementsRef = useRef<WeakSet<HTMLElement>>(new WeakSet());
  const selectedBlockIdRef = useRef<string | null>(selectedBlockId);
  const selectedPlaceholderRef = useRef<HTMLElement | null>(selectedPlaceholder);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; target: 'block' | 'placeholder' | null; id?: string } | null>(null);

  useEffect(() => { selectedBlockIdRef.current = selectedBlockId; }, [selectedBlockId]);
  useEffect(() => { selectedPlaceholderRef.current = selectedPlaceholder; }, [selectedPlaceholder]);

  const propsOnSelect = (b: any | null) => { if (onSelect) onSelect(b); };

  // ensure emitChange and insertHtmlAtCursor are declared before useImperativeHandle
  const getEditableHtmlFromDom = () => {
    if (!containerRef.current) return internalHtml || '';
    try {
      const clone = containerRef.current.cloneNode(true) as HTMLElement;
      const blocks = Array.from(clone.querySelectorAll('.tpl-block'));
      for (const b of blocks) b.remove();
      // Remove editor guide lines (red grid lines) so they don't appear in exported report
      const guideLines = Array.from(clone.querySelectorAll('.editor-guide-line'));
      for (const g of guideLines) g.remove();
      return clone.innerHTML;
    } catch (e) { return internalHtml || ''; }
  };

  const emitChange = (opts?: { pushHistory?: boolean }) => {
    const editableHtml = getEditableHtmlFromDom();
    let combined = editableHtml || '';
    for (const b of blocks) {
      try {
        const meta = { ...(b.meta || {}), left: b.left, top: b.top, width: b.width, height: b.height, html: b.html };
        const safe = JSON.stringify(meta).replace(/</g, '&lt;');
        combined += `<div class="tpl-block" data-block-id="${b.id}" data-block-json='${safe}' style="position:absolute; left:${b.left}px; top:${b.top}px">${b.html}</div>`;
      } catch (e) { /* ignore */ }
    }
    // sync internalHtml to editable content (without blocks) but avoid forcing a render on every tiny input by only updating when explicitly requested
    try { setInternalHtml(editableHtml); } catch (e) { }
    try { console.debug('[CanvasEditor] emitChange', { blocksCount: blocks.length, combinedLength: (combined || '').length, lockExpiresAt: localChangeLockRef.current }); } catch (e) { }
    // sanitize blocks before sending to parent (remove internal-only fields)
    const sanitize = (b: any) => {
      const out: any = {};
      for (const k of Object.keys(b || {})) {
        if (k.startsWith('_')) continue; // internal
        out[k] = b[k];
      }
      return out;
    };
    const payload: any = { html: combined || '', blocks: JSON.parse(JSON.stringify((blocks || []).map(sanitize))) };
    if (opts && (opts as any).immediate) payload.immediate = true;
    try { // push to global trace buffer for debugging reverts
      try {
        const w = (window as any);
        w.__CANVAS_TRACE__ = w.__CANVAS_TRACE__ || [];
        w.__CANVAS_TRACE__.push({ ts: Date.now(), type: 'emit', payload: payload, lock: localChangeLockRef.current });
        if (w.__CANVAS_TRACE__.length > 200) w.__CANVAS_TRACE__.shift();
      } catch (e) { /* ignore trace errors */ }
    } catch (e) { }
    onChange && onChange(payload as any);
    // push snapshot to history (blocks + html) optionally
    if (opts && opts.pushHistory === false) return;
    try {
      const snap = { html: editableHtml || '', blocks: JSON.parse(JSON.stringify(blocks || [])) };
      setHistory(h => {
        const next = h.slice(0, historyIndex + 1);
        next.push(snap);
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
      // give DOM a tick then emit an immediate change so parent persists inserted content
      setTimeout(() => emitChange({ immediate: true } as any), 20);
      return;
    }
    const range = sel.getRangeAt(0);
    if (!containerRef.current || !containerRef.current.contains(range.commonAncestorContainer)) {
      containerRef.current?.insertAdjacentHTML('beforeend', html);
      setTimeout(() => emitChange({ immediate: true } as any), 20);
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
    // update internal state to match DOM (editable content only)
    setInternalHtml(getEditableHtmlFromDom());
    // emit immediate so parent doesn't rehydrate with stale content
    setTimeout(() => emitChange({ immediate: true } as any), 20);
  };

  // expose imperative API so parent can call toolbox actions when toolbox is moved
  useImperativeHandle(ref, () => ({
    insertTextBlock: () => {
      setInsertAsBlock(false);
      setTextModalHtml('<p><em>Double-click to edit</em></p>');
      setIsTextModalOpen(true);
    },
    insertBlock: (opts?: { html?: string; left?: number; top?: number }) => {
      if (opts && opts.html) { insertBlockAt(opts.html, opts.left || 40, opts.top || 40); return; }
      setInsertAsBlock(true);
      setTextModalHtml('<p><em>Block: Double-click to edit</em></p>');
      setIsTextModalOpen(true);
    },
    insertPlaceholder: async () => {
      const id = window.prompt('Question ID to reference (e.g. 123)'); if (!id) return; const lbl = window.prompt('Placeholder label', `Question ${id}`) || `Question ${id}`; const safeLabel = String(lbl).replace(/</g, '&lt;');
      const html = `<span class="tpl-placeholder" contenteditable="false" data-qid="${id}" data-label="${safeLabel}" data-gramm="false" style="background:#eef2ff;border:1px dashed #c7d2fe;padding:2px 6px;border-radius:3px;margin:0 4px;display:inline-block;cursor:move;">${safeLabel}</span>`;
      insertHtmlAtCursor(html);
    },
    insertImageUrl: async () => { const url = window.prompt('Image URL'); if (!url) return; insertHtmlAtCursor(`<img src="${url}" style="max-width:100%;cursor:move;"/>`); },
    insertHtml: (html: string) => { if (!html) return; insertHtmlAtCursor(html); },
    zoomIn: () => setZoom(z => Math.min(2, +(z + 0.1).toFixed(2))),
    zoomOut: () => setZoom(z => Math.max(0.25, +(z - 0.1).toFixed(2))),
    undo: () => undo(),
    redo: () => redo(),
    insertShape: (shape: 'rect' | 'circle' | 'line', opts?: { left?: number; top?: number; width?: number; height?: number; fill?: string; stroke?: string }) => {
      const left = opts?.left ?? 40; const top = opts?.top ?? 40;
      const w = opts?.width ?? 120; const h = opts?.height ?? 60;
      const fill = opts?.fill ?? 'none'; const stroke = opts?.stroke ?? '#111';
      let svg = '';
      if (shape === 'rect') svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect x="0" y="0" width="${w}" height="${h}" fill="${fill}" stroke="${stroke}"/></svg>`;
      else if (shape === 'circle') svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><circle cx="${Math.round(w / 2)}" cy="${Math.round(h / 2)}" r="${Math.round(Math.min(w, h) / 2 - 4)}" fill="${fill}" stroke="${stroke}"/></svg>`;
      else if (shape === 'line') svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><line x1="0" y1="${Math.round(h / 2)}" x2="${w}" y2="${Math.round(h / 2)}" stroke="${stroke}" stroke-width="2"/></svg>`;
      insertBlockAt(svg, left, top);
    },
    duplicateSelected: () => {
      try {
        const sel = selectedBlockIdRef.current;
        if (!sel) return;
        const b = blocksRef.current.find(x => String(x.id) === String(sel));
        if (!b) return;
        const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const copy = { ...JSON.parse(JSON.stringify(b)), id, left: b.left + 10, top: b.top + 10, _localUpdatedAt: Date.now() };
        setBlocks(prev => [...prev, copy]);
        localChangeLockRef.current = Date.now() + 800;
        setTimeout(() => emitChange({ immediate: true } as any), 40);
      } catch (e) { console.error(e); }
    },

    // expose a method to get the latest combined HTML (flush current edits)
    getCombinedHtml: () => {
      // Use the cleaner export routine to avoid including editor-only guide lines
      // and other interactive helpers that should not appear in final output.
      const containerHtml = getEditableHtmlFromDom() || internalHtml || '';
      let combined = containerHtml || '';
      for (const b of blocksRef.current) {
        try {
          const meta = { ...(b.meta || {}), left: b.left, top: b.top, width: b.width, height: b.height, html: b.html };
          const safe = JSON.stringify(meta).replace(/</g, '&lt;');
          combined += `<div class="tpl-block" data-block-id="${b.id}" data-block-json='${safe}' style="position:absolute; left:${b.left}px; top:${b.top}px">${b.html}</div>`;
        } catch (e) { /* ignore */ }
      }
      return combined;
    }
    ,
    // update a positioned block directly (used by parent inspector to apply edits immediately)
    updateBlock: (blockId: string, updates: { left?: number; top?: number; html?: string; meta?: any }) => {
      try {
        const now = Date.now();
        setBlocks(prev => prev.map(b => (String(b.id) === String(blockId) ? { ...b, ...(updates.html !== undefined ? { html: updates.html } : {}), ...(updates.left !== undefined ? { left: updates.left } : {}), ...(updates.top !== undefined ? { top: updates.top } : {}), ...(updates.meta ? { meta: { ...(b.meta || {}), ...(updates.meta || {}) } } : {}), _localUpdatedAt: now } : b)));
        localChangeLockRef.current = Date.now() + 800;
        setTimeout(() => emitChange({ immediate: true } as any), 40);
      } catch (e) { console.error('updateBlock failed', e); }
    }
    ,
    // stacking / z-order helpers
    bringForward: (blockId: string) => {
      try {
        setBlocks(prev => {
          const idx = prev.findIndex(b => String(b.id) === String(blockId));
          if (idx === -1 || idx >= prev.length - 1) return prev;
          const next = prev.slice();
          const item = next.splice(idx, 1)[0];
          next.splice(idx + 1, 0, { ...item, _localUpdatedAt: Date.now() });
          return next;
        });
        localChangeLockRef.current = Date.now() + 800;
        setTimeout(() => emitChange({ immediate: true } as any), 40);
      } catch (e) { console.error('bringForward failed', e); }
    },
    sendBackward: (blockId: string) => {
      try {
        setBlocks(prev => {
          const idx = prev.findIndex(b => String(b.id) === String(blockId));
          if (idx <= 0) return prev;
          const next = prev.slice();
          const item = next.splice(idx, 1)[0];
          next.splice(idx - 1, 0, { ...item, _localUpdatedAt: Date.now() });
          return next;
        });
        localChangeLockRef.current = Date.now() + 800;
        setTimeout(() => emitChange({ immediate: true } as any), 40);
      } catch (e) { console.error('sendBackward failed', e); }
    },
    bringToFront: (blockId: string) => {
      try {
        setBlocks(prev => {
          const idx = prev.findIndex(b => String(b.id) === String(blockId));
          if (idx === -1 || idx >= prev.length - 1) return prev;
          const next = prev.slice();
          const item = next.splice(idx, 1)[0];
          next.push({ ...item, _localUpdatedAt: Date.now() });
          return next;
        });
        localChangeLockRef.current = Date.now() + 800;
        setTimeout(() => emitChange({ immediate: true } as any), 40);
      } catch (e) { console.error('bringToFront failed', e); }
    },
    sendToBack: (blockId: string) => {
      try {
        setBlocks(prev => {
          const idx = prev.findIndex(b => String(b.id) === String(blockId));
          if (idx <= 0) return prev;
          const next = prev.slice();
          const item = next.splice(idx, 1)[0];
          next.unshift({ ...item, _localUpdatedAt: Date.now() });
          return next;
        });
        localChangeLockRef.current = Date.now() + 800;
        setTimeout(() => emitChange({ immediate: true } as any), 40);
      } catch (e) { console.error('sendToBack failed', e); }
    }
    ,
    deleteBlock: (blockId: string) => {
      try {
        setBlocks(prev => prev.filter(b => String(b.id) !== String(blockId)));
        localChangeLockRef.current = Date.now() + 800;
        setTimeout(() => emitChange({ immediate: true } as any), 40);
      } catch (e) { console.error('deleteBlock failed', e); }
    }
  } as any), [insertHtmlAtCursor, internalHtml, blocksRef]);

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
      onChange && onChange({ html: combined, blocks: snap.blocks });
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
      onChange && onChange({ html: combined, blocks: snap.blocks });
    }, 20);
  };

  // Only update internalHtml from incoming `value` when the editor is not focused
  useEffect(() => {
    try {
      if (!containerRef.current || containerRef.current.contains(document.activeElement)) return;
      if (value !== internalHtml) setInternalHtml(value || '');
    } catch (e) { if (value !== internalHtml) setInternalHtml(value || ''); }
  }, [value]);

  // keep a ref of blocks for event handlers that run outside React render cycle
  useEffect(() => { blocksRef.current = blocks; }, [blocks]);

  // Track previous initialBlocks to detect changes
  const prevInitialBlocksRef = useRef<any[]>([]);

  // parse positioned blocks from incoming HTML value
  useEffect(() => {
    // If editor is focused, avoid re-parsing incoming value to prevent clobbering the user's edits
    try {
      if (containerRef.current && containerRef.current.contains(document.activeElement)) {
        try { console.debug('[CanvasEditor] skipping parse: editor focused'); } catch (e) { }
        return;
      }

      // prefer explicit initialBlocks prop (structured persistence path)
      // Check if initialBlocks has actually changed (by reference/length) before updating
      if (Array.isArray(initialBlocks)) {
        const blocksChanged =
          initialBlocks.length !== prevInitialBlocksRef.current.length ||
          initialBlocks.some((b, i) => prevInitialBlocksRef.current[i] !== b);

        if (blocksChanged) {
          // If we made a local change very recently, prefer local state — ignore incoming parent data for a short window
          try {
            if (Date.now() < (localChangeLockRef.current || 0)) {
              try { console.debug('[CanvasEditor] ignoring incoming initialBlocks due to recent local change', { now: Date.now(), lock: localChangeLockRef.current }); } catch (e) { }
              // do not update prevInitialBlocksRef so that future parent updates can be considered
              return;
            }
          } catch (e) { }
          try { console.debug('[CanvasEditor] initialBlocks changed; updating from prop', initialBlocks.length, 'prev:', prevInitialBlocksRef.current.length, 'current:', blocks.length); } catch (e) { }

          // Accept incoming initialBlocks if they're different from what we previously received
          // This allows us to accept both additions AND deletions from parent
          const prevIds = new Set((prevInitialBlocksRef.current || []).map((b: any) => String(b?.id || '')));
          const incomingIds = new Set((initialBlocks || []).map((b: any) => String(b?.id || '')));
          const idsChanged = prevIds.size !== incomingIds.size ||
            Array.from(prevIds).some((id: string) => !incomingIds.has(id)) ||
            Array.from(incomingIds).some((id: string) => !prevIds.has(id));

          // If the IDs are different, we should accept the incoming blocks (could be additions or deletions)
          if (idsChanged) {
            try { console.debug('[CanvasEditor] block IDs changed; accepting incoming initialBlocks', { was: Array.from(prevIds).slice(0, 3), now: Array.from(incomingIds).slice(0, 3) }); } catch (e) { }
            prevInitialBlocksRef.current = initialBlocks;
            setBlocks((initialBlocks || []).map((b: any) => ({ ...b })));
            if (value) setInternalHtml(value);
          } else {
            try { console.debug('[CanvasEditor] ignoring incoming blocks; has fewer blocks than current state'); } catch (e) { }
            prevInitialBlocksRef.current = initialBlocks;
          }
          return;
        }
      } else {
        prevInitialBlocksRef.current = [];
      }

      // backward-compat: parse positioned blocks from incoming HTML value only if we have no blocks yet
      if (!value) { setBlocks([]); return; }
      if (blocks.length > 0) {
        // Already have blocks loaded (likely from structured persistence), don't re-parse
        try { console.debug('[CanvasEditor] already have blocks; skipping parse'); } catch (e) { }
        return;
      }

      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(value, 'text/html');
        const found: any[] = [];
        const blockEls = Array.from(doc.querySelectorAll('div.tpl-block[data-block-id]'));
        try { console.debug('[CanvasEditor] parse incoming value, found blocks:', blockEls.length); } catch (e) { }
        const seenIds = new Set<string>();
        for (let i = 0; i < blockEls.length; i++) {
          const be = blockEls[i] as HTMLElement;
          try {
            let id = be.getAttribute('data-block-id') || `b_${Date.now()}`;
            if (seenIds.has(id)) {
              const uniq = `${id}_${i}_${Math.random().toString(36).slice(2, 6)}`;
              id = uniq;
              try { be.setAttribute('data-block-id', id); } catch (e) { }
            }
            seenIds.add(id);
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
        blockEls.forEach(el => el.remove());
        const remaining = doc.body ? doc.body.innerHTML : '';
        setInternalHtml(remaining || '');
        setBlocks(found);
      } catch (e) {
        // ignore parse errors
      }
    } catch (e) { /* ignore top-level */ }
  }, [value, initialBlocks]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // listen for edits to uploaded table cells inside the canvas and persist them
    const onFocusOut = async (ev: FocusEvent) => {
      try {
        const target = ev.target as HTMLElement | null;
        if (!target) return;
        const td = target.closest && (target.closest('td[data-upload-id]') as HTMLTableCellElement | null) || (target as HTMLTableCellElement).closest && (target as HTMLTableCellElement);
        if (!td) return;
        const uploadId = td.getAttribute('data-upload-id');
        const rowIndexAttr = td.getAttribute('data-row-index');
        const colKey = td.getAttribute('data-col-key');
        if (!uploadId || !colKey) return;
        const rowIndex = rowIndexAttr ? Number(rowIndexAttr) : 0;
        const newValue = td.innerText || td.textContent || '';
        // call server to persist
        try {
          const res = await apiFetch(`/api/uploaded_docs/${uploadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ rowIndex, colKey, newValue }) });
          if (res.ok) {
            const json = await res.json();
            // notify parent so it can refresh its uploadedDocs list
            try { propsOnSelect && propsOnSelect(null); } catch (e) { }
            (typeof (onUploadedDocUpdated) !== 'undefined') && (onUploadedDocUpdated as any) && (onUploadedDocUpdated as any)(json);
            // emit change so parent template updates
            setTimeout(() => emitChange({ immediate: true } as any), 40);
          } else {
            console.error('Failed to save uploaded doc cell', await res.text());
          }
        } catch (e) { console.error('Failed to save uploaded doc cell', e); }
      } catch (e) { /* ignore */ }
    };
    el.addEventListener('focusout', onFocusOut as any);
    const onKeyDown = (ev: KeyboardEvent) => {
      // undo/redo
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) {
        ev.preventDefault(); undo(); return;
      }
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'y' || ev.key === 'Y')) {
        ev.preventDefault(); redo(); return;
      }
      // duplicate selected block Ctrl+D
      if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'd' || ev.key === 'D')) {
        ev.preventDefault();
        const sel = selectedBlockIdRef.current;
        if (sel) {
          const b = blocksRef.current.find(x => String(x.id) === String(sel));
          if (b) {
            const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const copy = { ...JSON.parse(JSON.stringify(b)), id, left: b.left + 10, top: b.top + 10, _localUpdatedAt: Date.now() };
            setBlocks(prev => [...prev, copy]);
            localChangeLockRef.current = Date.now() + 800;
            setTimeout(() => emitChange({ immediate: true } as any), 40);
          }
        } else {
          // duplicate placeholder (inline) by inserting a copy at cursor
          const ph = selectedPlaceholderRef.current;
          if (ph) {
            try { insertHtmlAtCursor(ph.outerHTML); setTimeout(() => emitChange({ immediate: true } as any), 40); } catch (e) { }
          }
        }
        return;
      }

      // arrow-key movement for selected positioned blocks (snap/grid, respect zoom and page bounds)
      if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight' || ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        const sel = selectedBlockIdRef.current;
        if (sel) {
          ev.preventDefault();
          const stepPx = ev.shiftKey ? 10 : 1; // visual pixels to move (shift for larger)
          const grid = 5; // snap grid in logical px
          setBlocks(prev => prev.map(b => {
            if (String(b.id) !== String(sel)) return b;
            const paperRoot = containerRef.current ? (containerRef.current.closest('.paper-root') as HTMLElement | null) : null;
            const currentLeft = Number(b.left || 0);
            const currentTop = Number(b.top || 0);
            // convert visual step to logical units (account for zoom)
            const stepLogical = Math.max(1, Math.round(stepPx / (zoom || 1)));
            let newLeft = currentLeft;
            let newTop = currentTop;
            if (ev.key === 'ArrowLeft') newLeft = Math.max(0, currentLeft - stepLogical);
            if (ev.key === 'ArrowRight') newLeft = currentLeft + stepLogical;
            if (ev.key === 'ArrowUp') newTop = Math.max(0, currentTop - stepLogical);
            if (ev.key === 'ArrowDown') newTop = currentTop + stepLogical;
            // snap to grid
            newLeft = Math.round(newLeft / grid) * grid;
            newTop = Math.round(newTop / grid) * grid;
            // constrain to page bounds if we can determine them
            if (paperRoot) {
              try {
                const maxLogicalW = Math.round(paperRoot.offsetWidth / (zoom || 1));
                const maxLogicalH = Math.round(paperRoot.offsetHeight / (zoom || 1));
                const bw = (b.width != null && typeof b.width === 'number') ? b.width : ((b.width && typeof b.width === 'string') ? parseInt(b.width as any, 10) || 0 : 0);
                const bh = (b.height != null && typeof b.height === 'number') ? b.height : ((b.height && typeof b.height === 'string') ? parseInt(b.height as any, 10) || 0 : 0);
                const maxLeft = Math.max(0, maxLogicalW - (bw || 10));
                const maxTop = Math.max(0, maxLogicalH - (bh || 10));
                newLeft = Math.max(0, Math.min(newLeft, maxLeft));
                newTop = Math.max(0, Math.min(newTop, maxTop));
              } catch (e) { /* ignore bounds errors */ }
            }
            return { ...b, left: Math.round(newLeft), top: Math.round(newTop), _localUpdatedAt: Date.now() };
          }));
          localChangeLockRef.current = Date.now() + 800;
          setTimeout(() => { emitChange({ immediate: true } as any); propsOnSelect && propsOnSelect(blocksRef.current.find(x => String(x.id) === String(selectedBlockIdRef.current)) || null); }, 30);
        }
        return;
      }

      // delete/backspace handling
      if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
      // delete selected positioned block
      const selBlockId = selectedBlockIdRef.current;
      const selPlaceholder = selectedPlaceholderRef.current;
      if (selBlockId) {
        setBlocks(prev => prev.filter(b => String(b.id) !== String(selBlockId)));
        localChangeLockRef.current = Date.now() + 800;
        setSelectedBlockId(null);
        propsOnSelect && propsOnSelect(null);
        setTimeout(() => emitChange({ immediate: true } as any), 30);
        ev.preventDefault();
        return;
      }
      // delete selected placeholder
      if (selPlaceholder) {
        try {
          selPlaceholder.remove();
          setSelectedPlaceholder(null);
          propsOnSelect && propsOnSelect(null);
          setTimeout(() => emitChange({ immediate: true } as any), 30);
          ev.preventDefault();
        } catch (e) { /* ignore */ }
      }
    };
    document.addEventListener('keydown', onKeyDown);
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

    // Right-click context menu handler
    const handleContextMenu = (ev: MouseEvent) => {
      ev.preventDefault();
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      const placeholder = target.closest && (target.closest('.tpl-placeholder') as HTMLElement | null);
      const blockEl = target.closest && (target.closest('.tpl-block') as HTMLElement | null);
      if (placeholder) {
        setContextMenu({ x: ev.clientX, y: ev.clientY, target: 'placeholder' });
      } else if (blockEl) {
        const bid = blockEl.getAttribute('data-block-id');
        if (bid) setContextMenu({ x: ev.clientX, y: ev.clientY, target: 'block', id: bid });
      }
    };

    // Convert placeholders/images to blocks only after movement threshold to avoid duplicates on click
    const potentialDrag = { target: null as HTMLElement | null, startX: 0, startY: 0, moved: false };
    let watching = false;


    const onPointerDown = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null;
      if (!target) return;
      // don't convert if user is interacting with an existing positioned block
      if (target.closest && target.closest('.tpl-block')) return;
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
    el.addEventListener('contextmenu', handleContextMenu);
    // allow dragover/drop feedback on the paper-root when using Fabric
    const paperRoot = containerRef.current ? (containerRef.current.closest('.paper-root') as HTMLElement | null) : null;
    let dropIndicator: HTMLDivElement | null = null;
    if (paperRoot) {
      dropIndicator = document.createElement('div');
      dropIndicator.style.position = 'absolute';
      dropIndicator.style.width = '16px';
      dropIndicator.style.height = '16px';
      dropIndicator.style.border = '2px dashed #2563eb';
      dropIndicator.style.borderRadius = '4px';
      dropIndicator.style.pointerEvents = 'none';
      dropIndicator.style.display = 'none';
      dropIndicator.style.zIndex = '9999';
      paperRoot.appendChild(dropIndicator);
    }
    return () => {
      el.removeEventListener('click', handler);
      el.removeEventListener('mousedown', onPointerDown);
      el.removeEventListener('contextmenu', handleContextMenu);
      el.removeEventListener('focusout', onFocusOut as any);
      document.removeEventListener('keydown', onKeyDown);
      if (paperRoot && dropIndicator) try { paperRoot.removeChild(dropIndicator); } catch (e) { }
    };
  }, [propsOnSelect]);

  // toolbox handlers
  const handleInsertTextBlock = () => {
    setInsertAsBlock(false);
    setTextModalHtml('<p><em>Double-click to edit</em></p>');
    setIsTextModalOpen(true);
  };
  const handleInsertImageUrl = async () => {
    const url = window.prompt('Image URL'); if (!url) return; insertBlockAt(`<img src="${url}" style="max-width:100%;cursor:move;"/>`, 60, 60);
  };
  const handleInsertPlaceholder = () => {
    const id = window.prompt('Question ID to reference (e.g. 123)'); if (!id) return; const lbl = window.prompt('Placeholder label', `Question ${id}`) || `Question ${id}`; const safeLabel = String(lbl).replace(/</g, '&lt;'); insertHtmlAtCursor(`<span class="tpl-placeholder" contenteditable="false" data-qid="${id}" data-label="${safeLabel}" data-gramm="false" style="background:#eef2ff;border:1px dashed #c7d2fe;padding:2px 6px;border-radius:3px;margin:0 4px;display:inline-block;cursor:move;">${safeLabel}</span>`);
  };

  const insertBlockAt = (htmlContent: string, left = 40, top = 40) => {
    // Prevent accidental duplicates: if a block with same HTML is already at nearly the same
    // position, skip creating a new one and instead ignore or focus existing.
    try {
      const approx = (n1: number, n2: number) => Math.abs((n1 || 0) - (n2 || 0)) <= 4;
      const existing = blocksRef.current.find(x => String(x.html || '') === String(htmlContent || '') && approx(x.left || 0, left) && approx(x.top || 0, top));
      if (existing) {
        // already present — just select it
        setSelectedBlockId(existing.id);
        setTimeout(() => { emitChange({ pushHistory: true, immediate: true } as any); }, 40);
        return;
      }
    } catch (e) { }
    const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    // wrap content in a non-Grammarly container where possible to avoid extension conflicts
    const wrappedHtml = `<div data-gramm="false">${htmlContent}</div>`;
    const b = { id, html: wrappedHtml, left, top, width: null, height: null, meta: {}, _localUpdatedAt: Date.now() };
    // If inserting an element that exists inline in the editable region (e.g. pasted image), remove inline occurrences
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(wrappedHtml || '', 'text/html');
      const img = doc.querySelector('img');
      if (img && containerRef.current) {
        const src = img.getAttribute('src');
        if (src) {
          try {
            const imgs = Array.from(containerRef.current.querySelectorAll('img')) as HTMLImageElement[];
            const inlineImgs = imgs.filter(i => String(i.getAttribute('src') || '') === String(src));
            for (const ii of inlineImgs) {
              try { ii.parentElement ? ii.parentElement.removeChild(ii) : (ii as any).remove?.(); } catch (e) { /* ignore */ }
            }
            // Refresh internalHtml to reflect removals
            setInternalHtml(getEditableHtmlFromDom());
            // Also remove any existing positioned blocks using the same source to avoid duplicate positioned blocks
            try {
              setBlocks(prev => {
                return prev.filter(b => !(String(b.html || '').includes(String(src))));
              });
            } catch (e) { /* ignore */ }
          } catch (e) { /* ignore remove issues */ }
        }
      }
    } catch (e) { /* ignore parse/remove errors */ }
    // Ensure we don't keep other blocks with the same image src (prevent duplicate-sized copies)
    try {
      const parser2 = new DOMParser();
      const doc2 = parser2.parseFromString(wrappedHtml || '', 'text/html');
      const img2 = doc2.querySelector('img');
      if (img2 && img2.getAttribute('src')) {
        const src2 = img2.getAttribute('src') || '';
        setBlocks(prev => prev.filter(b => !(String(b.html || '').includes(String(src2)))));
      }
    } catch (e) { /* ignore */ }

    setBlocks(prev => { const next = [...prev, b]; return next; });
    // lock out incoming stale updates for a short while
    localChangeLockRef.current = Date.now() + 800;
    setTimeout(() => emitChange({ immediate: true } as any), 50);
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
        copy[bIndex] = { ...copy[bIndex], left: Math.max(0, Math.round(origLeft + dx)), top: Math.max(0, Math.round(origTop + dy)), _localUpdatedAt: Date.now() };
        return copy;
      });
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); localChangeLockRef.current = Date.now() + 800; setTimeout(() => emitChange({ immediate: true } as any), 50); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // resize blocks with mouse drag
  const startResizeBlock = (ev: React.MouseEvent, blockId: string, handle: 'se' | 'e' | 's' | 'w' | 'n' | 'nw' | 'ne' | 'sw') => {
    ev.preventDefault(); ev.stopPropagation();
    const startX = ev.clientX; const startY = ev.clientY;
    const bIndex = blocks.findIndex(b => b.id === blockId);
    if (bIndex === -1) return;
    const startBlock = blocks[bIndex];
    const origLeft = startBlock.left; const origTop = startBlock.top;
    const origW = (startBlock.width != null) ? startBlock.width : (containerRef.current ? (containerRef.current.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement)?.offsetWidth || 100 : 100);
    const origH = (startBlock.height != null) ? startBlock.height : (containerRef.current ? (containerRef.current.querySelector(`[data-block-id="${blockId}"]`) as HTMLElement)?.offsetHeight || 40 : 40);

    const onMove = (me: MouseEvent) => {
      const dx = (me.clientX - startX) / zoom;
      const dy = (me.clientY - startY) / zoom;
      setBlocks(prev => {
        const copy = prev.slice();
        const idx = copy.findIndex(x => x.id === blockId);
        if (idx === -1) return copy;
        let newLeft = copy[idx].left;
        let newTop = copy[idx].top;
        let newW = copy[idx].width != null ? copy[idx].width : origW;
        let newH = copy[idx].height != null ? copy[idx].height : origH;
        if (handle === 'se') {
          newW = Math.max(10, Math.round(origW + dx));
          newH = Math.max(10, Math.round(origH + dy));
        } else if (handle === 'e') {
          newW = Math.max(10, Math.round(origW + dx));
        } else if (handle === 's') {
          newH = Math.max(10, Math.round(origH + dy));
        } else if (handle === 'w') {
          newW = Math.max(10, Math.round(origW - dx));
          newLeft = Math.max(0, Math.round(origLeft + dx));
        } else if (handle === 'n') {
          newH = Math.max(10, Math.round(origH - dy));
          newTop = Math.max(0, Math.round(origTop + dy));
        } else if (handle === 'nw') {
          newW = Math.max(10, Math.round(origW - dx)); newLeft = Math.max(0, Math.round(origLeft + dx));
          newH = Math.max(10, Math.round(origH - dy)); newTop = Math.max(0, Math.round(origTop + dy));
        } else if (handle === 'ne') {
          newW = Math.max(10, Math.round(origW + dx));
          newH = Math.max(10, Math.round(origH - dy)); newTop = Math.max(0, Math.round(origTop + dy));
        } else if (handle === 'sw') {
          newW = Math.max(10, Math.round(origW - dx)); newLeft = Math.max(0, Math.round(origLeft + dx));
          newH = Math.max(10, Math.round(origH + dy));
        }
        // If the block contains an image, ensure it scales within the block by adding width/height:100% to the img style.
        let newHtml = copy[idx].html || '';
        try {
          if (/<img[^>]*>/i.test(newHtml)) {
            newHtml = newHtml.replace(/<img([^>]*)>/i, (m, attrs) => {
              // if style attribute exists, append width/height; otherwise add a style attr
              if (/style=\s*['\"]/.test(attrs)) {
                return `<img${attrs.replace(/style=(['\"])([^'\"]*)(['\"])/i, (mm, q, st) => `style=${q}${st};width:100%;height:100%${q}`)}>`;
              }
              return `<img${attrs} style="width:100%;height:100%">`;
            });
          }
        } catch (e) { /* ignore html updates */ }

        copy[idx] = { ...copy[idx], left: newLeft, top: newTop, width: newW, height: newH, html: newHtml, _localUpdatedAt: Date.now() };
        return copy;
      });
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); localChangeLockRef.current = Date.now() + 800; setTimeout(() => emitChange({ immediate: true } as any), 40); };
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
        copy[idx] = { ...copy[idx], left: Math.max(0, Math.round(origLeft + dx)), top: Math.max(0, Math.round(origTop + dy)), _localUpdatedAt: Date.now() };
        return copy;
      });
    };
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); localChangeLockRef.current = Date.now() + 800; setTimeout(() => emitChange({ immediate: true } as any), 50); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Convert certain inline elements (placeholders, images) into positioned blocks and start dragging them
  const elementToBlockAndDrag = (el: HTMLElement, clientX: number, clientY: number) => {
    try {
      // avoid repeating conversion for the same element if multiple move events fire
      try {
        if (convertedElementsRef.current.has(el)) return;
        convertedElementsRef.current.add(el);
      } catch (e) { }
      // if element is no longer in DOM, abort
      if (!el.isConnected) return;
      const paperRoot = containerRef.current ? (containerRef.current.closest('.paper-root') as HTMLElement | null) : null;
      const rootRect = paperRoot ? paperRoot.getBoundingClientRect() : { left: 0, top: 0 };
      const left = Math.max(0, Math.round((clientX - rootRect.left) / zoom));
      const top = Math.max(0, Math.round((clientY - rootRect.top) / zoom));
      // capture outerHTML and remove from editable content
      const html = el.outerHTML;
      // If this is a placeholder or image with identifying attributes, avoid duplicating
      try {
        const qid = el.getAttribute && el.getAttribute('data-qid');
        const src = (el as HTMLImageElement).getAttribute && (el as HTMLImageElement).getAttribute('src');
        if (qid) {
          const found = blocksRef.current.find(x => (x.meta && (String(x.meta.qid) === String(qid))) || (String(x.html || '').includes(`data-qid="${qid}"`)));
          if (found) {
            try { el.remove(); } catch (e) { }
            setSelectedBlockId(found.id);
            setTimeout(() => { beginDrag(found.id, clientX, clientY); emitChange({ immediate: true } as any); }, 10);
            return;
          }
        }
        if (src) {
          const found = blocksRef.current.find(x => String(x.html || '').includes(String(src)));
          if (found) {
            try { el.remove(); } catch (e) { }
            setSelectedBlockId(found.id);
            setTimeout(() => { beginDrag(found.id, clientX, clientY); emitChange({ immediate: true } as any); }, 10);
            return;
          }
        }
      } catch (e) { }
      // remove element from DOM and update internalHtml to avoid duplication when emitting combined HTML
      try { el.setAttribute && el.setAttribute('data-gramm', 'false'); } catch (e) { }
      try { el.remove(); } catch (e) { }
      // sync internalHtml with current DOM
      try { setInternalHtml(containerRef.current ? containerRef.current.innerHTML : ''); } catch (e) { /* ignore */ }
      const w = (el as HTMLElement).offsetWidth || null;
      const h = (el as HTMLElement).offsetHeight || null;
      // Avoid creating duplicates: if a similar block exists, start dragging that instead
      try {
        const approx = (n1: number, n2: number) => Math.abs((n1 || 0) - (n2 || 0)) <= 4;
        const existing = blocksRef.current.find(x => String(x.html || '') === String(html || '') && approx(x.left || 0, left) && approx(x.top || 0, top));
        if (existing) {
          // remove the inline element and begin dragging the existing block
          try { el.remove(); } catch (e) { }
          setTimeout(() => { beginDrag(existing.id, clientX, clientY); emitChange({ immediate: true } as any); }, 10);
          return;
        }
      } catch (e) { }
      const id = `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      // If there is an image source in the HTML, remove other blocks that reference the same src before creating the new block
      try {
        const parser3 = new DOMParser();
        const doc3 = parser3.parseFromString(html || '', 'text/html');
        const img3 = doc3.querySelector('img');
        if (img3 && img3.getAttribute('src')) {
          const src3 = img3.getAttribute('src') || '';
          setBlocks(prev => prev.filter(b => !(String(b.html || '').includes(String(src3)))));
        }
      } catch (e) { /* ignore */ }
      const newBlock = { id, html, left, top, width: w, height: h, meta: {}, _localUpdatedAt: Date.now() };
      setBlocks(prev => {
        const next = [...prev, newBlock];
        localChangeLockRef.current = Date.now() + 800;
        // start dragging slightly after state update so block exists in DOM
        setTimeout(() => {
          // ensure the change is emitted so the parent doesn't re-insert the removed element
          try { emitChange({ immediate: true } as any); } catch (e) { /* ignore */ }
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
      const files = Array.from(e.dataTransfer.files || []) as File[];
      if (files.length > 0) {
        const paperRoot = containerRef.current ? (containerRef.current.closest('.paper-root') as HTMLElement | null) : null;
        const rootRect = paperRoot ? paperRoot.getBoundingClientRect() : { left: 0, top: 0 };
        const clientX = (e.nativeEvent as any).clientX || 0;
        const clientY = (e.nativeEvent as any).clientY || 0;
        const left = Math.max(0, Math.round((clientX - rootRect.left) / zoom));
        const top = Math.max(0, Math.round((clientY - rootRect.top) / zoom));
        for (const f of files) {
          if (!f.type || !f.type.startsWith('image/')) continue;
          const reader = new FileReader();
          reader.onload = (ev) => {
            const dataUrl = ev.target?.result as string;
            const html = `<img src="${dataUrl}" style="max-width:100%;cursor:move;" />`;
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
      // For legacy canvas, insert as a positioned block at drop coordinates for images/tables/placeholders
      try {
        const paperRoot = containerRef.current ? (containerRef.current.closest('.paper-root') as HTMLElement | null) : null;
        const rootRect = paperRoot ? paperRoot.getBoundingClientRect() : { left: 0, top: 0 };
        const clientX = (e.nativeEvent as any).clientX || 0;
        const clientY = (e.nativeEvent as any).clientY || 0;
        const left = Math.max(0, Math.round((clientX - rootRect.left) / zoom));
        const top = Math.max(0, Math.round((clientY - rootRect.top) / zoom));
        const tmp = document.createElement('div'); tmp.innerHTML = html;
        const img = tmp.querySelector('img');
        if (img && img.getAttribute('src')) { insertBlockAt(`<img src="${img.getAttribute('src')}" style="max-width:100%;cursor:move;"/>`, left, top); return; }
        const table = tmp.querySelector('table');
        if (table) { insertBlockAt(table.outerHTML, left, top); return; }
        if (html.includes('tpl-placeholder') || html.includes('tpl-block')) { insertBlockAt(html, left, top); return; }
      } catch (e) { /* fallback to inline insert */ }
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
            <div className="grid grid-cols-3 gap-2">
              <button title="Text" className="p-2 border rounded flex items-center justify-center" onClick={handleInsertTextBlock} aria-label="Insert text"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 6h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M10 6v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
              <button title="Block" className="p-2 border rounded flex items-center justify-center" onClick={handleInsertBlock} aria-label="Insert block"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" stroke="currentColor" strokeWidth="1.4" /></svg></button>
              {/* Placeholder insertion removed — drag questions from the panel instead */}
              <button title="Image" className="p-2 border rounded flex items-center justify-center" onClick={handleInsertImageUrl} aria-label="Insert image"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" /><circle cx="8.5" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.2" /><path d="M21 19l-6-6-4 4-3-3-4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" /></svg></button>
              <button title="Rectangle" className="p-2 border rounded flex items-center justify-center" onClick={() => (ref as any)?.current?.insertShape?.('rect', { width: 140, height: 80 })} aria-label="Insert rectangle"><svg width="16" height="12" viewBox="0 0 24 16" fill="none"><rect x="3" y="2" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.2" /></svg></button>
              <button title="Circle" className="p-2 border rounded flex items-center justify-center" onClick={() => (ref as any)?.current?.insertShape?.('circle', { width: 90, height: 90 })} aria-label="Insert circle"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.2" /></svg></button>
              <button title="Line" className="p-2 border rounded flex items-center justify-center" onClick={() => (ref as any)?.current?.insertShape?.('line', { width: 200, height: 4 })} aria-label="Insert line"><svg width="16" height="6" viewBox="0 0 24 6" fill="none"><line x1="1" y1="3" x2="23" y2="3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg></button>
            </div>
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
              data-gramm="false"
              contentEditable
              suppressContentEditableWarning
              onInput={() => { /* allow typing without forcing a re-render; changes flushed on blur or programmatic inserts */ }}
              onPaste={(ev: React.ClipboardEvent<HTMLDivElement>) => {
                try {
                  const cb = ev.clipboardData as DataTransfer | undefined;
                  if (!cb) return;
                  // prefer files first (images copied from filesystem)
                  const files: File[] = cb.files ? Array.from(cb.files as FileList) as File[] : [];
                  let handled = false;
                  if (files && files.length > 0) {
                    for (const f of files) {
                      try {
                        if (f && f.type && f.type.indexOf('image/') === 0) {
                          ev.preventDefault();
                          const reader = new FileReader();
                          reader.onload = (r) => {
                            try {
                              const dataUrl = r.target?.result as string || '';
                              // insert as a positioned block roughly at the center of the paper
                              const paperRoot = containerRef.current ? (containerRef.current.closest('.paper-root') as HTMLElement | null) : null;
                              const rect = paperRoot ? paperRoot.getBoundingClientRect() : (containerRef.current ? containerRef.current.getBoundingClientRect() : { width: 200, height: 200, left: 0, top: 0 });
                              const left = Math.max(24, Math.round((rect.width / 2) / (zoom || 1) - 60));
                              const top = Math.max(24, Math.round((rect.height / 2) / (zoom || 1) - 40));
                              insertBlockAt(`<img src="${dataUrl}" style="max-width:100%;cursor:move;"/>`, left, top);
                            } catch (err) { /* ignore */ }
                          };
                          reader.readAsDataURL(f);
                          handled = true;
                          break;
                        }
                      } catch (e) { /* ignore per file */ }
                    }
                  }

                  // If not handled via files, try clipboard items (may be images pasted from screenshot tool)
                  if (!handled) {
                    const items: DataTransferItem[] = cb.items ? Array.from(cb.items as DataTransferItemList) as DataTransferItem[] : [];
                    for (const it of items) {
                      try {
                        if (it && it.type && it.type.indexOf('image/') === 0) {
                          ev.preventDefault();
                          const blob = (it as DataTransferItem).getAsFile ? (it as DataTransferItem).getAsFile() : null;
                          if (!blob) continue;
                          const reader = new FileReader();
                          reader.onload = (r) => {
                            try {
                              const dataUrl = r.target?.result as string || '';
                              const paperRoot = containerRef.current ? (containerRef.current.closest('.paper-root') as HTMLElement | null) : null;
                              const rect = paperRoot ? paperRoot.getBoundingClientRect() : (containerRef.current ? containerRef.current.getBoundingClientRect() : { width: 200, height: 200, left: 0, top: 0 });
                              const left = Math.max(24, Math.round((rect.width / 2) / (zoom || 1) - 60));
                              const top = Math.max(24, Math.round((rect.height / 2) / (zoom || 1) - 40));
                              insertBlockAt(`<img src="${dataUrl}" style="max-width:100%;cursor:move;"/>`, left, top);
                            } catch (err) { /* ignore */ }
                          };
                          reader.readAsDataURL(blob);
                          handled = true;
                          break;
                        }
                      } catch (e) { /* ignore per item */ }
                    }
                  }
                } catch (e) { /* ignore */ }
              }}
              onBlur={() => emitChange({ pushHistory: true })}
              onDrop={onDrop}
              onDragOver={e => e.preventDefault()}
              style={{
                width: '100%',
                height: '100%',
                position: 'relative',
                backgroundImage: `linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)`,
                backgroundSize: `${20 * zoom}px ${20 * zoom}px, ${20 * zoom}px ${20 * zoom}px`,
                backgroundPosition: '0 0, 0 0',
                minHeight: 200,
                direction: 'ltr',
                unicodeBidi: 'embed'
              }}
            >
              <div dangerouslySetInnerHTML={{ __html: internalHtml }} />
              {/* center red guide lines (vertical + horizontal) - editor only, marked for removal from exported HTML */}
              <div className="editor-guide-line" style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'rgba(220,38,38,0.85)', zIndex: 5, pointerEvents: 'none' }} />
              <div className="editor-guide-line" style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: 'rgba(220,38,38,0.85)', zIndex: 5, pointerEvents: 'none' }} />
              {/* faint red guide lines as background grid - also editor only */}
              <div className="editor-guide-line" style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: 'rgba(220,38,38,0.12)', zIndex: 0, pointerEvents: 'none' }} />
              <div className="editor-guide-line" style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: 'rgba(220,38,38,0.12)', zIndex: 0, pointerEvents: 'none' }} />

              {/* positioned blocks */}
              {blocks.map((b, idx) => {
                const style: any = { position: 'absolute', left: b.left + 'px', top: b.top + 'px', cursor: 'move', border: selectedBlockId === b.id ? '1px solid #2563eb' : '1px dashed rgba(0,0,0,0.08)', padding: 4, background: '#fff', zIndex: 20 + idx };
                if (b.width) style.width = (typeof b.width === 'number' ? `${b.width}px` : b.width);
                if (b.height) style.height = (typeof b.height === 'number' ? `${b.height}px` : b.height);
                return (
                  <div key={b.id} className={`tpl-block`} data-gramm="false" data-block-id={b.id} data-block-json={JSON.stringify(b.meta || {})} style={style} onMouseDown={(ev) => startDragBlock(ev as any, b.id)} onClick={(e) => { e.stopPropagation(); setSelectedBlockId(b.id); propsOnSelect && propsOnSelect({ ...b }); }} onDoubleClick={() => { setEditingBlockId(b.id); setTextModalHtml(b.html); setIsTextModalOpen(true); }}>
                    <div style={{ width: '100%', height: '100%' }} dangerouslySetInnerHTML={{ __html: b.html }} />
                    {/* resize handles */}
                    <div onMouseDown={(ev) => startResizeBlock(ev as any, b.id, 'se')} style={{ position: 'absolute', right: -6, bottom: -6, width: 12, height: 12, background: '#fff', border: '1px solid rgba(0,0,0,0.2)', cursor: 'se-resize', borderRadius: 2 }} />
                    <div onMouseDown={(ev) => startResizeBlock(ev as any, b.id, 'e')} style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 8, height: 16, background: '#fff', border: '1px solid rgba(0,0,0,0.12)', cursor: 'ew-resize', borderRadius: 2 }} />
                    <div onMouseDown={(ev) => startResizeBlock(ev as any, b.id, 's')} style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', width: 16, height: 8, background: '#fff', border: '1px solid rgba(0,0,0,0.12)', cursor: 'ns-resize', borderRadius: 2 }} />
                    <div onMouseDown={(ev) => startResizeBlock(ev as any, b.id, 'w')} style={{ position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)', width: 8, height: 16, background: '#fff', border: '1px solid rgba(0,0,0,0.12)', cursor: 'ew-resize', borderRadius: 2 }} />
                    <div onMouseDown={(ev) => startResizeBlock(ev as any, b.id, 'n')} style={{ position: 'absolute', top: -6, left: '50%', transform: 'translateX(-50%)', width: 16, height: 8, background: '#fff', border: '1px solid rgba(0,0,0,0.12)', cursor: 'ns-resize', borderRadius: 2 }} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {/* Inspector moved to parent (ReportBuilder Page) - Canvas should not render inspector alongside itself */}

      {/* Context menu for blocks and placeholders */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-300 rounded shadow-lg z-50 py-1"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseLeave={() => setContextMenu(null)}
        >
          {contextMenu.target === 'block' && (
            <>
              <button
                className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-100"
                onClick={() => {
                  if (contextMenu.id) {
                    const block = blocksRef.current.find(b => String(b.id) === String(contextMenu.id));
                    if (block) {
                      setEditingBlockId(block.id);
                      setTextModalHtml(block.html);
                      setIsTextModalOpen(true);
                    }
                  }
                  setContextMenu(null);
                }}
              >
                Edit
              </button>
              <button
                className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-100"
                onClick={() => {
                  if (contextMenu.id) {
                    const block = blocksRef.current.find(b => String(b.id) === String(contextMenu.id));
                    if (block) {
                      try { navigator.clipboard.writeText(JSON.stringify(block)); } catch (e) { console.error(e); }
                    }
                  }
                  setContextMenu(null);
                }}
              >
                Copy
              </button>
              <button
                className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-100"
                onClick={() => {
                  if (contextMenu.id) {
                    const block = blocksRef.current.find(b => String(b.id) === String(contextMenu.id));
                    if (block) {
                      const copy = { ...JSON.parse(JSON.stringify(block)), id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, left: (block.left || 0) + 10, top: (block.top || 0) + 10, _localUpdatedAt: Date.now() };
                      setBlocks(prev => [...prev, copy]);
                      localChangeLockRef.current = Date.now() + 800;
                      setTimeout(() => emitChange({ immediate: true } as any), 40);
                    }
                  }
                  setContextMenu(null);
                }}
              >
                Duplicate
              </button>
              <button
                className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-100 text-red-600"
                onClick={() => {
                  if (contextMenu.id) {
                    setBlocks(prev => prev.filter(b => String(b.id) !== String(contextMenu.id)));
                    setSelectedBlockId(null);
                    localChangeLockRef.current = Date.now() + 800;
                    setTimeout(() => emitChange({ immediate: true } as any), 30);
                  }
                  setContextMenu(null);
                }}
              >
                Delete
              </button>
            </>
          )}
          {contextMenu.target === 'placeholder' && (
            <>
              <button
                className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-100"
                onClick={() => {
                  setContextMenu(null);
                }}
              >
                Edit
              </button>
              <button
                className="w-full text-left px-4 py-1.5 text-sm hover:bg-gray-100 text-red-600"
                onClick={() => {
                  if (selectedPlaceholderRef.current) {
                    try { selectedPlaceholderRef.current.remove(); setSelectedPlaceholder(null); emitChange({ immediate: true } as any); } catch (e) { }
                  }
                  setContextMenu(null);
                }}
              >
                Delete
              </button>
            </>
          )}
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
                if (editingBlockId) {
                  // update existing positioned block's HTML and mark as local change
                  const now = Date.now();
                  setBlocks(prev => prev.map(b => (b.id === editingBlockId ? { ...b, html: textModalHtml, _localUpdatedAt: now } : b)));
                  localChangeLockRef.current = Date.now() + 800;
                  setEditingBlockId(null);
                  setTimeout(() => emitChange({ immediate: true } as any), 40);
                } else {
                  if (insertAsBlock) insertBlockAt(textModalHtml, 40, 40); else insertHtmlAtCursor(textModalHtml);
                }
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
