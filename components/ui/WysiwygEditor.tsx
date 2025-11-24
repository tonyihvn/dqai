import React, { useEffect, useRef, useState } from 'react';
import CanvasEditor from './CanvasEditor';

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

  // If TinyMCE isn't available or we didn't resolve a client API key, fall back to the in-repo CanvasEditor to avoid runtime validation errors.
  if (!EditorComp || tinyKey === null) {
    return <CanvasEditor value={value} onChange={onChange} />;
  }

  // EditorComp is TinyMCE's Editor component
  return (
    <EditorComp
      apiKey={tinyKey || ''}
      onInit={(evt: any, editor: any) => { editorRef.current = editor; }}
      initialValue={value || ''}
      init={{
        height: 400,
        menubar: false,
        plugins: [
          'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'print', 'preview', 'anchor',
          'searchreplace', 'visualblocks', 'code', 'fullscreen',
          'insertdatetime', 'media', 'table', 'paste', 'help', 'wordcount', 'directionality'
        ],
        // Ensure requested tools are visible: table, media, charmap, image, and list controls
        toolbar: 'undo redo | table media charmap image | formatselect | bold italic backcolor | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | removeformat | ltr rtl | help',
        // Force left-to-right layout inside the editor content to avoid accidental RTL rendering
        content_style: 'body { font-family:Arial,sans-serif; font-size:14px; direction:ltr; unicode-bidi:embed; }',
      }}
      onEditorChange={(c: string) => onChange && onChange(c)}
    />
  );
};

export default WysiwygEditor;
