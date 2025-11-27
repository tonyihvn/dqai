import React, { useMemo, useState, useEffect } from 'react';

type Column<T> = {
  key: string;
  label: string;
  editable?: boolean;
  width?: string;
  render?: (row: T) => React.ReactNode;
};

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  onCellEdit?: (rowIndex: number, key: string, newValue: any) => void;
  pageSize?: number;
  // optional key to persist column visibility per table (defaults to hash of column keys)
  persistKey?: string;
}

export default function DataTable<T extends Record<string, any>>({ columns, data, onCellEdit, pageSize = 100, persistKey }: DataTableProps<T>) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showControls, setShowControls] = useState(false);

  // compute a stable storage key when not provided
  const computedKey = persistKey || `datatable_visible_${columns.map(c => c.key).join('__')}`;
  const [visibleMap, setVisibleMap] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(computedKey);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    // default: all true
    const m: Record<string, boolean> = {};
    columns.forEach(c => m[c.key] = true);
    return m;
  });

  useEffect(() => {
    // when columns change, ensure map includes them
    setVisibleMap(prev => {
      const copy = { ...prev };
      let changed = false;
      columns.forEach(c => { if (copy[c.key] === undefined) { copy[c.key] = true; changed = true; } });
      if (changed) {
        try { localStorage.setItem(computedKey, JSON.stringify(copy)); } catch (e) { }
      }
      return copy;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.map(c => c.key).join(',' )]);

  const setVisible = (key: string, v: boolean) => {
    setVisibleMap(prev => {
      const next = { ...prev, [key]: v };
      try { localStorage.setItem(computedKey, JSON.stringify(next)); } catch (e) { }
      return next;
    });
  };

  const visibleColumns = columns.filter(c => visibleMap[c.key]);

  const filtered = useMemo(() => {
    if (!data) return [] as T[];
    return data.filter(row => {
      return visibleColumns.every(col => {
        const f = filters[col.key];
        if (!f || String(f).trim() === '') return true;
        const val = row[col.key];
        if (val === null || typeof val === 'undefined') return false;
        return String(val).toLowerCase().includes(String(f).toLowerCase());
      });
    }).slice(0, pageSize);
  }, [data, filters, columns, pageSize, visibleMap]);

  const handleChange = (key: string, v: string) => setFilters(prev => ({ ...prev, [key]: v }));

  return (
    <div className="relative">
      <div className="flex items-center justify-end mb-2">
        <div className="relative">
          <button onClick={() => setShowControls(s => !s)} className="px-2 py-1 border rounded text-sm bg-white">Columns ▾</button>
          {showControls && (
            <div className="absolute right-0 mt-2 w-56 bg-white border rounded shadow z-50 p-3">
              <div className="text-xs font-medium mb-2">Toggle columns</div>
              <div className="space-y-1 max-h-56 overflow-auto">
                {columns.map(col => (
                  <label key={col.key} className="flex items-center text-sm">
                    <input type="checkbox" checked={!!visibleMap[col.key]} onChange={e => setVisible(col.key, e.target.checked)} className="mr-2" />
                    <span>{col.label}</span>
                  </label>
                ))}
              </div>
              <div className="mt-2 text-right">
                <button className="px-2 py-1 text-xs text-gray-600" onClick={() => { setVisibleMap(() => { const m: Record<string, boolean> = {}; columns.forEach(c => m[c.key] = true); try { localStorage.setItem(computedKey, JSON.stringify(m)); } catch (e) {} return m; }); }}>Show All</button>
                <button className="ml-2 px-2 py-1 text-xs text-gray-600" onClick={() => { setVisibleMap(() => { const m: Record<string, boolean> = {}; columns.forEach(c => m[c.key] = false); try { localStorage.setItem(computedKey, JSON.stringify(m)); } catch (e) {} return m; }); }}>Hide All</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {visibleColumns.map(col => (
                <th key={col.key} style={{ width: col.width }} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  <div className="flex flex-col">
                    <span className="truncate">{col.label}</span>
                    <input
                      placeholder="Search"
                      value={filters[col.key] || ''}
                      onChange={e => handleChange(col.key, e.target.value)}
                      className="mt-1 block w-full border-gray-200 rounded text-xs px-2 py-1"
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filtered.map((row, rIdx) => (
              <tr key={rIdx} data-row-index={rIdx}>
                {visibleColumns.map(col => (
                  <td key={col.key} className="px-2 py-2 align-top text-sm">
                    {col.editable && onCellEdit ? (
                      <input
                        value={row[col.key] ?? ''}
                        onChange={e => onCellEdit(rIdx, col.key, e.target.value)}
                        className="w-full border-gray-200 rounded text-sm px-2 py-1"
                      />
                    ) : col.render ? (
                      col.render(row)
                    ) : (
                      String(row[col.key] ?? '')
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
