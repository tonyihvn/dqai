import React, { useRef, useEffect } from 'react';

interface Props {
    value?: string;
    onChange?: (html: string) => void;
}

const RichTextEditor: React.FC<Props> = ({ value = '', onChange }) => {
    const ref = useRef<HTMLDivElement | null>(null);

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
        document.execCommand(cmd, false, val || undefined);
        onChange && onChange(ref.current?.innerHTML || '');
    };

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
        <div className="richtext-editor">
            <div className="mb-2 flex gap-2">
                <button type="button" onClick={() => exec('bold')} className="px-2 py-1 border rounded">B</button>
                <button type="button" onClick={() => exec('italic')} className="px-2 py-1 border rounded">I</button>
                <button type="button" onClick={() => exec('underline')} className="px-2 py-1 border rounded">U</button>
                <button type="button" onClick={() => {
                    const url = prompt('Enter URL'); if (url) exec('createLink', url);
                }} className="px-2 py-1 border rounded">Link</button>
                <label className="px-2 py-1 border rounded cursor-pointer">Image<input type="file" accept="image/*" onChange={handleImage} className="hidden" /></label>
            </div>
            <div
                ref={ref}
                contentEditable
                dir="ltr"
                onInput={() => onChange && onChange(ref.current?.innerHTML || '')}
                className="min-h-[120px] p-2 border rounded prose max-w-full"
                style={{ outline: 'none', overflow: 'auto', unicodeBidi: 'embed' }}
            />
        </div>
    );
};

export default RichTextEditor;
