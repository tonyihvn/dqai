import React, { useEffect, useRef } from 'react';

type Option = { value: string | number; label: string };

type Props = {
    id?: string;
    label?: string;
    type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'time' | 'textarea' | 'select' | 'file' | 'radio' | 'checkbox';
    value?: any;
    onChange?: (v: any) => void;
    options?: Option[];
    placeholder?: string;
    required?: boolean;
    rows?: number;
    name?: string;
    className?: string;
};

const MInput: React.FC<Props> = ({ id, label, type = 'text', value, onChange, options = [], placeholder, required, rows = 3, name, className }) => {
    const rootRef = useRef<HTMLDivElement | null>(null);

    // Materialize removed: no initialization needed

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        if (!onChange) return;
        if (type === 'file') {
            onChange((e as React.ChangeEvent<HTMLInputElement>).target.files);
        } else if (type === 'checkbox') {
            onChange((e as React.ChangeEvent<HTMLInputElement>).target.checked);
        } else {
            onChange(e.target.value);
        }
    };

    const inputId = id || name || `minput-${Math.random().toString(36).slice(2, 9)}`;

    if (type === 'textarea') {
        return (
            <div ref={rootRef} className={`flex flex-col gap-1 ${className || ''}`}>
                {label && <label htmlFor={inputId} className="font-medium text-sm text-gray-700">{label}{required ? '*' : ''}</label>}
                <textarea id={inputId} className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500" value={value ?? ''} onChange={handleChange} rows={rows} placeholder={placeholder} />
            </div>
        );
    }

    if (type === 'select') {
        return (
            <div ref={rootRef} className={`flex flex-col gap-1 ${className || ''}`}>
                {label && <label htmlFor={inputId} className="font-medium text-sm text-gray-700">{label}{required ? '*' : ''}</label>}
                <select id={inputId} value={value ?? ''} onChange={handleChange} className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option value="" disabled>{placeholder ?? 'Choose an option'}</option>
                    {options.map((opt) => (
                        <option key={String(opt.value)} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>
        );
    }

    if (type === 'file') {
        return (
            <div ref={rootRef} className={`flex flex-col gap-1 ${className || ''}`}>
                {label && <label htmlFor={inputId} className="font-medium text-sm text-gray-700">{label}{required ? '*' : ''}</label>}
                <input id={inputId} type="file" onChange={handleChange} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" />
            </div>
        );
    }

    if (type === 'radio' || type === 'checkbox') {
        return (
            <label className="inline-flex items-center gap-2">
                <input id={inputId} name={name} type={type} checked={!!value} onChange={handleChange} className="form-checkbox h-4 w-4 text-primary-600 border-gray-300 rounded" />
                <span className="text-sm text-gray-700">{label}</span>
            </label>
        );
    }

    // default input
    if (type === 'date') {
        return (
            <div ref={rootRef} className={`flex flex-col gap-1 ${className || ''}`}>
                {label && <label htmlFor={inputId} className="font-medium text-sm text-gray-700">{label}{required ? '*' : ''}</label>}
                <input id={inputId} type="date" value={value ?? ''} onChange={handleChange} placeholder={placeholder} className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500" />
            </div>
        );
    }
    return (
        <div ref={rootRef} className={`flex flex-col gap-1 ${className || ''}`}>
            {label && <label htmlFor={inputId} className="font-medium text-sm text-gray-700">{label}{required ? '*' : ''}</label>}
            <input id={inputId} type={type} value={value ?? ''} onChange={handleChange} placeholder={placeholder} className="border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500" />
        </div>
    );
};

export default MInput;
