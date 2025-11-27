import React, { useRef, useEffect, useState } from 'react';

interface Props {
    value?: string;
    onChange?: (html: string) => void;
}

const RichTextEditor: React.FC<Props> = ({ value = '', onChange }) => {
    const ref = useRef<HTMLDivElement | null>(null);
    const [isFull, setIsFull] = useState(false);

    useEffect(() => {
        if (!ref.current) return;
        // Avoid clobbering the user's caret while they are actively editing (focused element)
        if (document.activeElement === ref.current) return;
        try {
            if (value !== ref.current.innerHTML) {
                ref.current.innerHTML = value || '';
            }
        } catch (e) {
            // In some edge cases the ref may not be ready; try again on next frame
            requestAnimationFrame(() => {
                try { if (ref.current && value !== ref.current.innerHTML) ref.current.innerHTML = value || ''; } catch (err) { }
            });
        }
    }, [value]);

    // Ensure initial mount sets content once the div is available.
    useEffect(() => {
        if (!ref.current) return;
        // If editor not focused, ensure initial content is populated.
        if (document.activeElement !== ref.current && (ref.current.innerHTML || '') !== (value || '')) {
            // Use a tiny delay to allow mount timing to settle
            const t = setTimeout(() => {
                try { if (ref.current) ref.current.innerHTML = value || ''; } catch (e) { }
            }, 10);
            return () => clearTimeout(t);
        }
    }, []);

    const exec = (cmd: string, val?: string) => {
        try { document.execCommand(cmd, false, val || undefined); } catch (e) { }
        onChange && onChange(ref.current?.innerHTML || '');
    };

    const applyFont = (font: string) => { exec('fontName', font); };
    const applyFontSize = (size: string) => {
        // execCommand fontSize expects 1-7; map reasonable px sizes
        const mapping: Record<string, string> = { '10px': '1', '12px': '2', '14px': '3', '16px': '4', '18px': '5', '24px': '6', '32px': '7' };
        const v = mapping[size] || '3';
        exec('fontSize', v);
        // additionally apply explicit inline style for better fidelity
        try {
            const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            const span = document.createElement('span'); span.style.fontSize = size; span.appendChild(range.extractContents()); range.insertNode(span);
            onChange && onChange(ref.current?.innerHTML || '');
        } catch (e) { }
    };

    const applyLineHeight = (lh: string) => {
        try {
            const sel = window.getSelection(); if (!sel || !sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            const span = document.createElement('span'); span.style.lineHeight = lh; span.appendChild(range.extractContents()); range.insertNode(span);
            onChange && onChange(ref.current?.innerHTML || '');
        } catch (e) { }
    };

    const toggleFullscreen = () => setIsFull(f => !f);

    const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
            const data = reader.result as string;
            exec('insertImage', data);
        };
        reader.readAsDataURL(f);
    };

    return (
        <div className={`richtext-editor ${isFull ? 'rte-fullscreen' : ''}`}>
            <div className="mb-2 flex gap-2 flex-wrap items-center">
                <button type="button" onClick={() => exec('bold')} className="px-2 py-1 border rounded">B</button>
                <button type="button" onClick={() => exec('italic')} className="px-2 py-1 border rounded">I</button>
                <button type="button" onClick={() => exec('underline')} className="px-2 py-1 border rounded">U</button>
                <button type="button" onClick={() => {
                    const url = prompt('Enter URL'); if (url) exec('createLink', url);
                }} className="px-2 py-1 border rounded">Link</button>
                <label className="px-2 py-1 border rounded cursor-pointer">Image<input type="file" accept="image/*" onChange={handleImage} className="hidden" /></label>
                <select onChange={e => applyFont(e.target.value)} defaultValue="">
                    <option value="" disabled>Font</option>
                    <option value="Arial">Arial</option>
                    <option value="Helvetica">Helvetica</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Courier New">Courier New</option>
                </select>
                <select onChange={e => applyFontSize(e.target.value)} defaultValue="">
                    <option value="" disabled>Size</option>
                    <option value="10px">10px</option>
                    <option value="12px">12px</option>
                    <option value="14px">14px</option>
                    <option value="16px">16px</option>
                    <option value="18px">18px</option>
                    <option value="24px">24px</option>
                    <option value="32px">32px</option>
                </select>
                <select onChange={e => applyLineHeight(e.target.value)} defaultValue="">
                    <option value="" disabled>Line</option>
                    <option value="1">1</option>
                    <option value="1.15">1.15</option>
                    <option value="1.5">1.5</option>
                    <option value="2">2</option>
                </select>
                <button type="button" onClick={toggleFullscreen} className="px-2 py-1 border rounded">{isFull ? 'Exit Full' : 'Fullscreen'}</button>
            </div>
            <div
                ref={ref}
                contentEditable
                dir="ltr"
                onInput={() => onChange && onChange(ref.current?.innerHTML || '')}
                className="min-h-[120px] p-2 border rounded prose max-w-full"
                style={{ outline: 'none', overflow: 'auto', unicodeBidi: 'embed' }}
            />
            <style>{`
                .rte-fullscreen { position: fixed; inset: 0; z-index: 8000; background: #fff; padding: 18px; }
                .rte-fullscreen .min-h-[120px] { min-height: calc(100vh - 120px) !important; }
            `}</style>
        </div>
    );
};

export default RichTextEditor;
