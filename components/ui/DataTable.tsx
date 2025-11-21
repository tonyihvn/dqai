import React, { useMemo, useState } from 'react';

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
}

export default function DataTable<T extends Record<string, any>>({ columns, data, onCellEdit, pageSize = 100 }: DataTableProps<T>) {
  const [filters, setFilters] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    if (!data) return [] as T[];
    return data.filter(row => {
      return columns.every(col => {
        const f = filters[col.key];
        if (!f || String(f).trim() === '') return true;
        const val = row[col.key];
        if (val === null || typeof val === 'undefined') return false;
        return String(val).toLowerCase().includes(String(f).toLowerCase());
      });
    }).slice(0, pageSize);
  }, [data, filters, columns, pageSize]);

  const handleChange = (key: string, v: string) => setFilters(prev => ({ ...prev, [key]: v }));

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map(col => (
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
            <tr key={rIdx}>
              {columns.map(col => (
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
  );
}
