import React, { useEffect, useRef, useState } from 'react';
import RichTextEditor from './RichTextEditor';

type Props = {
  value?: string;
  onChange?: (html: string) => void;
};

// This component will try to dynamically load TinyMCE React integration if available.
// If TinyMCE isn't installed, it falls back to the in-repo CanvasEditor.
const WysiwygEditor: React.FC<Props> = ({ value = '', onChange }) => {
  const [EditorComp, setEditorComp] = useState<any>(null);
  const [tinyKey, setTinyKey] = useState<string | null>(null);
  const editorRef = useRef<any>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import('@tinymce/tinymce-react');
        if (!mounted) return;
        setEditorComp(() => mod.Editor);
      } catch (e) {
        // TinyMCE not installed — we'll stay with CanvasEditor fallback
        console.warn('TinyMCE not available, using CanvasEditor fallback');
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Attempt to fetch TinyMCE API key from a lightweight server endpoint (falls back to window/global and import.meta.env)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // prefer window-injected value if present
        const winKey = (window as any).__TINYMCE_API_KEY__;
        if (winKey) { if (mounted) setTinyKey(String(winKey)); return; }

        // Try to fetch from server endpoint `/api/client_env` which exposes only safe client env values
        try {
          const r = await fetch('/api/client_env');
          if (r.ok) {
            const j = await r.json();
            if (j && j.TINYMCE_API_KEY) { if (mounted) { setTinyKey(String(j.TINYMCE_API_KEY)); return; } }
          }
        } catch (e) {
          // ignore fetch error and fallback to import.meta.env
        }

        // Fallback to import.meta.env (Vite). Support both bare TINYMCE_API_KEY and VITE_TINYMCE_API_KEY
        const im = (typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env : {};
        const envKey = im && (im.TINYMCE_API_KEY || im.VITE_TINYMCE_API_KEY) ? (im.TINYMCE_API_KEY || im.VITE_TINYMCE_API_KEY) : '';
        // Do not use a hard-coded demo key (can cause validation errors). If no key is provided
        // we'll leave tinyKey as null so the caller can fall back to an in-repo editor instead.
        if (mounted) setTinyKey(envKey || null);
      } catch (e) {
        if (mounted) setTinyKey('');
      }
    })();
    return () => { mounted = false; };
  }, []);

  // If TinyMCE isn't available or we didn't resolve a client API key, fall back to the in-repo RichTextEditor to avoid runtime validation errors.
  // Only initialize TinyMCE when we have both the Editor component and a non-empty API key
  // EditorComp is TinyMCE's Editor component
  // Ensure the editor content follows `value` prop updates. TinyMCE's Editor instance
  // exists in `editorRef.current` after `onInit`. When `value` changes we should
  // update the editor only if its current content differs to avoid clobbering user edits.
  useEffect(() => {
    try {
      const ed = editorRef.current;
      if (!ed) return;
      // TinyMCE editor exposes `getContent`/`setContent`.
      if (typeof ed.getContent === 'function' && typeof ed.setContent === 'function') {
        const curr = String(ed.getContent({ format: 'html' }) || '');
        const incoming = String(value || '');
        if (curr !== incoming) {
          try { ed.setContent(incoming); } catch (e) { /* ignore setContent errors */ }
        }
      }
    } catch (e) { /* ignore */ }
  }, [value]);

  if (!EditorComp || !tinyKey) {
    return <RichTextEditor value={value} onChange={onChange} />;
  }

  // return TinyMCE Editor component
  return (
    <EditorComp
      apiKey={tinyKey || ''}
      onInit={(evt: any, editor: any) => {
        editorRef.current = editor;
        // Set initial content only once on init
        if (value) editor.setContent(value);

        // Prevent parent containers from clipping TinyMCE popup/dropdowns
        try {
          const root = editor.getContainer && editor.getContainer();
          if (root && root.parentElement) {
            // allow dropdowns to render fully
            root.parentElement.style.overflow = 'visible';
            root.style.zIndex = '3000';
          }
        } catch (err) { /* ignore */ }
      }}
      init={{
        height: 400,
        menubar: false,
        plugins: [
          'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'anchor',
          'searchreplace', 'visualblocks', 'code', 'fullscreen',
          'insertdatetime', 'media', 'table', 'help', 'wordcount', 'directionality', 'codesample',
          'code', 'quickbars'
        ],
        toolbar:
          'undo redo | fontselect fontsizeselect | bold italic underline | forecolor backcolor | lineheightfullscreen | alignleft aligncenter alignright | bullist numlist | table image media | link | code fullscreen',
        toolbar_mode: 'floating',
        zIndex: 3000,
        // keep default content styling, but ensure popups are visible
        content_style:
          'body { font-family:Arial,sans-serif; font-size:14px; direction:ltr; unicode-bidi:embed; }'
      }}
      onEditorChange={(c: string) => onChange?.(c)}
    />
  );

};

export default WysiwygEditor;
