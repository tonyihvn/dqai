import React, { useState } from 'react';
import Button from './Button';

interface TreeJsonEditorProps {
  value: any;
  onChange: (v: any) => void;
  editable?: boolean;
  onAddNode?: (path: string[]) => void;
  onDeleteNode?: (path: string[]) => void;
}

/**
 * TreeJsonEditor: A custom tree-based JSON editor
 * Provides safer nested CRUD operations than textarea-based editing
 * Supports inline editing, add/delete of nested objects and array elements
 * Displays JSON as an expandable tree with inline value editors
 */
const TreeJsonEditor: React.FC<TreeJsonEditorProps> = ({
  value,
  onChange,
  editable = true,
  onAddNode,
  onDeleteNode,
}) => {
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']));
  const [addMode, setAddMode] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');

  const pathToString = (path: string[]): string => path.join('.');

  const togglePath = (path: string[]) => {
    const key = pathToString(path);
    const next = new Set(expandedPaths);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedPaths(next);
  };

  // Recursive helper to set value at path
  const setByPath = (obj: any, path: string[], newVal: any): any => {
    if (path.length === 0) return newVal;
    const [head, ...tail] = path;
    const copy = Array.isArray(obj) ? [...obj] : { ...obj };
    copy[head] = tail.length === 0 ? newVal : setByPath(copy[head] || {}, tail, newVal);
    return copy;
  };

  // Recursive helper to get value at path
  const getByPath = (obj: any, path: string[]): any => {
    let current = obj;
    for (const key of path) {
      if (current === null || current === undefined) return undefined;
      current = current[key];
    }
    return current;
  };

  // Recursive helper to delete value at path
  const deleteByPath = (obj: any, path: string[]): any => {
    if (path.length === 0) return obj;
    const [head, ...tail] = path;
    const copy = Array.isArray(obj) ? [...obj] : { ...obj };
    if (tail.length === 0) {
      if (Array.isArray(copy)) {
        copy.splice(Number(head), 1);
      } else {
        delete copy[head];
      }
      return copy;
    }
    copy[head] = deleteByPath(copy[head] || {}, tail);
    return copy;
  };

  const handleAddProperty = () => {
    if (!newKeyName.trim()) return;
    try {
      const newObj = Array.isArray(value) ? [...value] : { ...value };
      if (Array.isArray(newObj)) {
        newObj.push({ [newKeyName]: '' });
      } else {
        newObj[newKeyName] = '';
      }
      onChange(newObj);
      setNewKeyName('');
      setAddMode(false);
      if (onAddNode) onAddNode([newKeyName]);
    } catch (e) {
      console.error('Failed to add property:', e);
    }
  };

  const renderTreeNode = (data: any, path: string[] = []): React.ReactNode => {
    const isExpandable = data !== null && (typeof data === 'object');
    const isArray = Array.isArray(data);
    const isExpanded = expandedPaths.has(pathToString(path));
    const pathStr = pathToString(path);
    const isRoot = path.length === 0;

    if (!isExpandable) {
      // Leaf node (primitive value)
      return (
        <div className="flex items-center gap-2 py-1 pl-4">
          <span className="text-gray-500 text-xs">•</span>
          {editable ? (
            <input
              type="text"
              value={String(data ?? '')}
              onChange={(e) => {
                const newVal = e.target.value;
                // Try to parse as number, boolean, null, or string
                let parsed: any = newVal;
                if (newVal === 'null') parsed = null;
                else if (newVal === 'true') parsed = true;
                else if (newVal === 'false') parsed = false;
                else if (!isNaN(Number(newVal)) && newVal.trim() !== '') parsed = Number(newVal);
                onChange(setByPath(value, path, parsed));
              }}
              className="flex-1 border rounded px-2 py-1 text-sm font-mono bg-white"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-sm font-mono text-blue-600">
              {typeof data === 'string' ? `"${data}"` : String(data)}
            </span>
          )}
        </div>
      );
    }

    // Container node (object or array)
    const entries = isArray
      ? data.map((item: any, idx: number) => [String(idx), item])
      : Object.entries(data);

    return (
      <div key={pathStr} className="space-y-1">
        {!isRoot && (
          <div
            onClick={() => togglePath(path)}
            className="flex items-center gap-2 py-1 pl-4 cursor-pointer hover:bg-gray-100 rounded"
          >
            <span className="text-gray-600 text-sm font-bold w-4">
              {isExpanded ? '▼' : '▶'}
            </span>
            <span className="text-gray-700 font-mono text-sm">
              {isArray ? `[${data.length}]` : `{}`}
            </span>
            {editable && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm('Delete this item?')) {
                    onChange(deleteByPath(value, path));
                    if (onDeleteNode) onDeleteNode(path);
                  }
                }}
                className="ml-auto text-xs text-red-600 hover:text-red-800 px-2 py-1"
              >
                🗑
              </button>
            )}
          </div>
        )}

        {isExpanded && (
          <div className="border-l border-gray-300 ml-6 pl-0">
            {entries.map(([key, val]) => {
              const childPath = [...path, key];
              const isChildExpandable = val !== null && typeof val === 'object';

              return (
                <div key={pathToString(childPath)} className="space-y-0">
                  <div className="flex items-center gap-2 py-1 pl-4">
                    {isChildExpandable ? (
                      <span
                        onClick={() => togglePath(childPath)}
                        className="text-gray-600 text-sm font-bold w-4 cursor-pointer hover:text-gray-900"
                      >
                        {expandedPaths.has(pathToString(childPath)) ? '▼' : '▶'}
                      </span>
                    ) : (
                      <span className="text-gray-500 text-xs w-4">•</span>
                    )}
                    <span className="text-gray-700 font-mono text-sm min-w-24">{key}:</span>
                    {isChildExpandable ? (
                      <span className="text-gray-500 text-xs">
                        {Array.isArray(val) ? `[${val.length}]` : '{}'}
                      </span>
                    ) : (
                      editable ? (
                        <input
                          type="text"
                          value={String(val ?? '')}
                          onChange={(e) => {
                            const newVal = e.target.value;
                            let parsed: any = newVal;
                            if (newVal === 'null') parsed = null;
                            else if (newVal === 'true') parsed = true;
                            else if (newVal === 'false') parsed = false;
                            else if (!isNaN(Number(newVal)) && newVal.trim() !== '') parsed = Number(newVal);
                            onChange(setByPath(value, childPath, parsed));
                          }}
                          className="flex-1 border rounded px-2 py-1 text-sm font-mono bg-white max-w-xs"
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        <span className="text-sm font-mono text-blue-600">
                          {typeof val === 'string' ? `"${val}"` : String(val)}
                        </span>
                      )
                    )}
                    {editable && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Delete this item?')) {
                            onChange(deleteByPath(value, childPath));
                            if (onDeleteNode) onDeleteNode(childPath);
                          }
                        }}
                        className="ml-auto text-xs text-red-600 hover:text-red-800 px-2 py-1"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                  {isChildExpandable && expandedPaths.has(pathToString(childPath)) && (
                    <div className="border-l border-gray-300 ml-6 pl-0">
                      {renderTreeNode(val, childPath)}
                    </div>
                  )}
                </div>
              );
            })}

            {editable && isArray && (
              <div className="flex gap-2 items-center py-2 pl-4">
                <Button
                  size="sm"
                  onClick={() => {
                    const newArray = [...data, {}];
                    onChange(setByPath(value, path, newArray));
                  }}
                  className="text-xs"
                >
                  + Add Item
                </Button>
              </div>
            )}

            {editable && !isArray && !addMode && (
              <div className="flex gap-2 items-center py-2 pl-4">
                <Button
                  size="sm"
                  onClick={() => setAddMode(true)}
                  className="text-xs"
                >
                  + Add Property
                </Button>
              </div>
            )}

            {editable && !isArray && addMode && isRoot && (
              <div className="flex gap-2 items-center py-2 pl-4">
                <input
                  type="text"
                  placeholder="Property name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  className="flex-1 border p-1 rounded text-sm"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddProperty();
                    if (e.key === 'Escape') {
                      setAddMode(false);
                      setNewKeyName('');
                    }
                  }}
                />
                <Button size="sm" onClick={handleAddProperty} className="text-xs">
                  Add
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setAddMode(false);
                    setNewKeyName('');
                  }}
                  className="text-xs"
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="border rounded-lg bg-gray-50 p-4" style={{ maxHeight: '65vh', overflow: 'auto' }}>
        <div className="font-mono text-sm">
          {renderTreeNode(value)}
        </div>
      </div>

      {editable && (
        <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded">
          💡 Tip: Click ▶/▼ to expand/collapse. Edit values directly in the inputs. Click 🗑 to delete items. Use "+ Add" buttons to add new properties or array elements.
        </div>
      )}
    </div>
  );
};

export default TreeJsonEditor;
