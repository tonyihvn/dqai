import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMockData } from '../hooks/useMockData';
import { FormDefinition, FormPage, FormSection, Question, AnswerType } from '../types';
import { PlusIcon, TrashIcon, ArrowUpIcon, ArrowDownIcon, ArrowLeftIcon, ArrowUpTrayIcon, QuestionMarkCircleIcon, ExclamationCircleIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import * as ExcelJS from 'exceljs';

const makeFieldName = (text: string) => String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || `f_${Date.now()}`;
// --- Types for Validation ---
type QuestionErrors = {
  questionText?: string;
  options?: string;
  fieldName?: string;
};

// --- Question Editor Component ---
interface QuestionEditorProps {
  question: Question;
  pIdx: number;
  sIdx: number;
  qIdx: number;
  isFirst: boolean;
  isLast: boolean;
  errors?: QuestionErrors;
  moveQuestion: (p: number, s: number, q: number, dir: 'up' | 'down') => void;
  deleteQuestion: (p: number, s: number, q: number) => void;
  updateQuestion: (p: number, s: number, q: number, val: Partial<Question>) => void;
  onOpenDatasetModal?: (p: number, s: number, q: number) => void;
}

const QuestionEditor: React.FC<QuestionEditorProps> = ({
  question, pIdx, sIdx, qIdx, isFirst, isLast, errors, moveQuestion, deleteQuestion, updateQuestion, onOpenDatasetModal
}) => {
  const hasOptions = [AnswerType.DROPDOWN, AnswerType.RADIO, AnswerType.CHECKBOX].includes(question.answerType);
  const isFile = question.answerType === AnswerType.FILE;
  const collapsed = !!(question.metadata && question.metadata.collapsed);

  const parsePastedOptions = (pasteData: string): { label: string; value: string }[] => {
    return pasteData
      .split('\n')
      .map(line => line.trim())
      .filter(line => line)
      .map(line => {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          return { label: parts[1], value: parts[0] };
        }
        return { label: parts[0], value: parts[0] };
      });
  };

  return (
    <div className={`bg-gray-50 p-4 my-2 rounded-lg border transition-all hover:shadow-md ${errors ? 'border-red-300 ring-1 ring-red-200' : 'border-gray-200'}`}>
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center space-x-2">
          <button type="button" onClick={() => updateQuestion(pIdx, sIdx, qIdx, { metadata: { ...(question.metadata || {}), collapsed: !collapsed } })} className="text-gray-500 hover:text-gray-700 p-1">
            {collapsed ? <ChevronRightIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />}
          </button>
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide bg-gray-200 px-2 py-0.5 rounded">{question.answerType}</span>
          {question.required && <span className="ml-2 text-xs font-semibold text-red-600 bg-red-100 px-2 py-0.5 rounded">Required</span>}
          {/* Group Name and Score Inputs */}
          <div className="ml-4 flex items-center gap-2">
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">Group:</label>
              <input
                type="text"
                className="border px-1 py-0.5 rounded text-xs w-24"
                value={question.questionGroup || ''}
                onChange={e => updateQuestion(pIdx, sIdx, qIdx, { questionGroup: e.target.value })}
                placeholder="Group name"
              />
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs text-gray-500">Score:</label>
              <input type="number" min={0} className="border px-1 py-0.5 rounded text-xs w-20" value={question.metadata?.score ?? ''} onChange={e => updateQuestion(pIdx, sIdx, qIdx, { metadata: { ...(question.metadata || {}), score: e.target.value === '' ? undefined : Number(e.target.value) } })} />
            </div>
          </div>
          <div className="flex flex-col">
            <button type="button" onClick={() => moveQuestion(pIdx, sIdx, qIdx, 'up')} disabled={isFirst} className="text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowUpIcon className="h-4 w-4" /></button>
            <button type="button" onClick={() => moveQuestion(pIdx, sIdx, qIdx, 'down')} disabled={isLast} className="text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowDownIcon className="h-4 w-4" /></button>
          </div>
        </div>
        <Button variant='danger' size='sm' onClick={() => deleteQuestion(pIdx, sIdx, qIdx)}><TrashIcon className="h-4 w-4" /></Button>
      </div>

      {!collapsed ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Question Text <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={question.questionText}
                onChange={e => {
                  const newText = e.target.value;
                  // Auto-suggest fieldName unless user has manually edited it.
                  const currentField = question.fieldName || '';
                  const suggestedFromOld = makeFieldName(question.questionText || '');
                  // If field is empty or still matches the auto-suggest from previous question text, update it.
                  if (!currentField || currentField === suggestedFromOld || currentField.startsWith(suggestedFromOld + '_')) {
                    const suggested = makeFieldName(newText);
                    updateQuestion(pIdx, sIdx, qIdx, { questionText: newText, fieldName: suggested });
                  } else {
                    updateQuestion(pIdx, sIdx, qIdx, { questionText: newText });
                  }
                }}
                className={`mt-1 block w-full shadow-sm sm:text-sm rounded-md ${errors?.questionText ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'}`}
              />
              {errors?.questionText && (
                <p className="mt-1 text-xs text-red-600 flex items-center">
                  <ExclamationCircleIcon className="h-3 w-3 mr-1" />
                  {errors.questionText}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Field Name (machine-friendly)</label>
              <input type="text" value={question.fieldName || ''} onChange={e => updateQuestion(pIdx, sIdx, qIdx, { fieldName: e.target.value })} className={`mt-1 block w-full shadow-sm sm:text-sm rounded-md ${errors?.fieldName ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'}`} />
              <p className="text-xs text-gray-500 mt-1">Used in computed formulas and exports. Use letters, numbers and underscores only.</p>
              {errors?.fieldName && (
                <p className="mt-1 text-xs text-red-600 flex items-center">
                  <ExclamationCircleIcon className="h-3 w-3 mr-1" />
                  {errors.fieldName}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Helper Text</label>
              <input type="text" value={question.questionHelper || ''} onChange={e => updateQuestion(pIdx, sIdx, qIdx, { questionHelper: e.target.value })} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Column Width (12-grid)</label>
              <select value={question.columnSize} onChange={e => updateQuestion(pIdx, sIdx, qIdx, { columnSize: Number(e.target.value) })} className="mt-1 block w-full shadow-sm sm:text-sm border-gray-300 rounded-md">
                <option value={12}>12 — Full width</option>
                <option value={6}>6 — Half width</option>
                <option value={4}>4 — One third</option>
                <option value={3}>3 — One quarter</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Required</label>
              <div className="mt-1 min-h-[38px] flex items-center">
                <label className="inline-flex items-center">
                  <input type="checkbox" checked={!!question.required} onChange={e => updateQuestion(pIdx, sIdx, qIdx, { required: e.target.checked })} className="mr-2" />
                  <span className="text-sm text-gray-700">This question is required</span>
                </label>
              </div>
            </div>
          </div>

          {hasOptions && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">
                Options (Dropdown/Radio/Checkbox) <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-1">Paste from Excel (Value [tab] Label) to populate.</p>
              <textarea
                rows={3}
                className={`mt-1 block w-full shadow-sm sm:text-sm rounded-md font-mono text-xs ${errors?.options ? 'border-red-500 focus:ring-red-500 focus:border-red-500' : 'border-gray-300 focus:ring-primary-500 focus:border-primary-500'}`}
                placeholder="1	Option One&#10;2	Option Two"
                onPaste={e => {
                  const pastedText = e.clipboardData.getData('text');
                  const options = parsePastedOptions(pastedText);
                  if (options.length > 0) {
                    e.preventDefault();
                    updateQuestion(pIdx, sIdx, qIdx, { options });
                  }
                }}
              />
              <div className="mt-2 flex items-center gap-2">
                <button type="button" onClick={() => { if (typeof onOpenDatasetModal === 'function') onOpenDatasetModal(pIdx, sIdx, qIdx); }} className="text-sm text-primary-600 hover:underline">Load from API</button>
                <span className="text-xs text-gray-400">·</span>
                <div className="text-xs text-gray-500">or</div>
              </div>
              {errors?.options && (
                <p className="mt-1 text-xs text-red-600 flex items-center">
                  <ExclamationCircleIcon className="h-3 w-3 mr-1" />
                  {errors.options}
                </p>
              )}
              <div className="mt-2">
                <div className="mb-2 text-xs text-gray-600">Or create options manually:</div>
                <div className="space-y-2">
                  {(question.options || []).map((o: any, i: number) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input className="border px-2 py-1 rounded w-1/2" value={o.label} onChange={e => updateQuestion(pIdx, sIdx, qIdx, { options: (question.options || []).map((opt: any, idx: number) => idx === i ? { ...opt, label: e.target.value } : opt) })} />
                      <input className="border px-2 py-1 rounded w-1/2" value={o.value} onChange={e => updateQuestion(pIdx, sIdx, qIdx, { options: (question.options || []).map((opt: any, idx: number) => idx === i ? { ...opt, value: e.target.value } : opt) })} />
                      <button className="text-red-500" onClick={() => updateQuestion(pIdx, sIdx, qIdx, { options: (question.options || []).filter((_: any, idx: number) => idx !== i) })}>Remove</button>
                    </div>
                  ))}
                  <div>
                    <button type="button" onClick={() => updateQuestion(pIdx, sIdx, qIdx, { options: [...(question.options || []), { label: 'New Option', value: `${Date.now()}` }] })} className="text-sm text-primary-600">+ Add Option</button>
                  </div>
                </div>
              </div>
            </div>
          )}

            {/* Dataset modal is rendered at the page level to avoid referencing page-level state from inside QuestionEditor */}

          {question.answerType === AnswerType.COMPUTED && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Computed Formula</label>
              <p className="text-xs text-gray-500 mb-1">Enter a JavaScript-like expression using other field names as variables. Example: <code>field_a + field_b * 2</code>. Use only numbers for arithmetic. The result will be computed at fill-time.</p>
              <textarea rows={3} className="mt-1 block w-full shadow-sm sm:text-sm rounded-md border-gray-300 font-mono text-sm" value={(question.metadata && question.metadata.computedFormula) || ''} onChange={e => updateQuestion(pIdx, sIdx, qIdx, { metadata: { ...(question.metadata || {}), computedFormula: e.target.value } })} />
            </div>
          )}

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700">Visibility Condition (Show If)</label>
            <textarea rows={2} placeholder="e.g. age > 18" className="mt-1 block w-full shadow-sm sm:text-sm rounded-md border-gray-300 font-mono text-sm" value={(question.metadata && question.metadata.showIf) || ''} onChange={e => updateQuestion(pIdx, sIdx, qIdx, { metadata: { ...(question.metadata || {}), showIf: e.target.value } })} />
          </div>

          {isFile && (
            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700">Allowed File Types</label>
              <p className="text-xs text-gray-500 mb-1">Enter comma-separated MIME types or extensions (e.g. <code>image/*,application/pdf</code> or <code>.jpg,.png,.pdf</code>).</p>
              <input type="text" value={(question.metadata && question.metadata.allowedFileTypes) ? (question.metadata.allowedFileTypes.join(',')) : ''} onChange={e => {
                const vals = String(e.target.value).split(',').map(s => s.trim()).filter(Boolean);
                updateQuestion(pIdx, sIdx, qIdx, { metadata: { ...(question.metadata || {}), allowedFileTypes: vals } });
              }} className="mt-1 block w-full shadow-sm sm:text-sm rounded-md border-gray-300" />
            </div>
          )}

          {/* Display reviewers_comment Checkbox and label */}
          <div className="mt-4 flex flex-col gap-2">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                id={`reviewers_comment_${question.id}`}
                checked={!!(question.metadata && question.metadata.displayReviewersComment)}
                onChange={e => updateQuestion(pIdx, sIdx, qIdx, { metadata: { ...(question.metadata || {}), displayReviewersComment: e.target.checked } })}
              />
              <span className="text-xs text-gray-700">Display reviewer comment field</span>
            </label>
            {question.metadata && question.metadata.displayReviewersComment && (
              <div className="flex items-center gap-2 mt-2">
                <label className="text-xs text-gray-500">Reviewer Comment Label:</label>
                <input
                  type="text"
                  className="border px-1 py-0.5 rounded text-xs w-40"
                  value={question.metadata.reviewerCommentLabel || "Reviewer's Comment"}
                  onChange={e => updateQuestion(pIdx, sIdx, qIdx, { metadata: { ...question.metadata, reviewerCommentLabel: e.target.value } })}
                  placeholder="Reviewer's Comment"
                />
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="py-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-gray-800">{question.questionText || '(no text)'}</div>
              <div className="text-xs text-gray-500">{question.answerType}{question.required ? ' · Required' : ''}</div>
            </div>
            <div className="text-xs text-gray-500">Field: {question.fieldName || '-'}</div>
          </div>
        </div>
      )}
      {/* Score moved to header */}
    </div>
  );
};

// --- Main Component ---
const BuildFormPage: React.FC = () => {
  const { activityId } = useParams<{ activityId: string }>();
  const navigate = useNavigate();
  const { getActivity, getFormDefinition, saveFormDefinition, currentUser } = useMockData();
  const [activity, setActivity] = useState(getActivity(activityId || ''));
  const [formDef, setFormDef] = useState<FormDefinition | undefined>(getFormDefinition(activityId || ''));
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false);
  const [isDatasetModalOpen, setIsDatasetModalOpen] = useState(false);
  const [datasetsList, setDatasetsList] = useState<any[]>([]);
  const [dsLoading, setDsLoading] = useState(false);
  const [dsSelectedForQuestion, setDsSelectedForQuestion] = useState<{pIdx:number,sIdx:number,qIdx:number} | null>(null);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | null>(null);
  const [selectedLabelField, setSelectedLabelField] = useState<string>('');
  const [selectedValueField, setSelectedValueField] = useState<string>('');
  const [datasetSampleRows, setDatasetSampleRows] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<Record<string, QuestionErrors>>({});

  useEffect(() => {
    if (activityId) {
      const act = getActivity(activityId);
      setActivity(act);
      if (act) {
        const originalFormDef = getFormDefinition(activityId);
        let currentFormDef = originalFormDef;
        // Determine whether this activity already has a saved form (non-empty questions)
        const hadSaved = !!(originalFormDef && Array.isArray(originalFormDef.pages) && originalFormDef.pages.some(p => p.sections && p.sections.some(s => (s.questions || []).length > 0)));
        setIsSaved(hadSaved);
        if (!currentFormDef || !Array.isArray(currentFormDef.pages) || currentFormDef.pages.length === 0) {
          currentFormDef = {
            id: `fd-${activityId}`,
            activityId,
            pages: [{ id: 'page1', name: 'Page 1', sections: [{ id: 'sec1', name: 'General Information', questions: [] }] }]
          };
        }
        setFormDef(currentFormDef);
      }
    }
  }, [activityId, getActivity, getFormDefinition]);

  const validateForm = (): boolean => {
    if (!formDef) return false;
    const newErrors: Record<string, QuestionErrors> = {};
    let isValid = true;

    // First pass: basic checks and collect field names
    const fieldNameCounts: Record<string, number> = {};
    const allQuestions: Question[] = [];
    formDef.pages.forEach(page => {
      page.sections.forEach(section => {
        section.questions.forEach(q => {
          allQuestions.push(q);
          const qErrors: QuestionErrors = {};

          if (!q.questionText || q.questionText.trim() === '') {
            qErrors.questionText = 'Question text is required';
            isValid = false;
          }

          if ([AnswerType.DROPDOWN, AnswerType.RADIO, AnswerType.CHECKBOX].includes(q.answerType)) {
            if (!q.options || q.options.length === 0) {
              qErrors.options = 'At least one option is required for this question type';
              isValid = false;
            }
          }

          if (q.required && (!q.questionText || q.questionText.trim() === '')) {
            qErrors.questionText = 'Required question must have text';
            isValid = false;
          }

          // normalize fieldName existence
          const fn = (q.fieldName || '').trim();
          if (fn) {
            fieldNameCounts[fn] = (fieldNameCounts[fn] || 0) + 1;
          }

          if (Object.keys(qErrors).length > 0) {
            newErrors[q.id] = qErrors;
          }
        });
      });
    });

    // Second pass: check for duplicate or missing fieldNames for computed fields
    allQuestions.forEach(q => {
      const fn = (q.fieldName || '').trim();
      const qErrors: QuestionErrors = newErrors[q.id] || {};
      if (q.answerType === AnswerType.COMPUTED) {
        if (!fn) {
          qErrors.fieldName = 'Computed fields require a machine-friendly field name';
          isValid = false;
        }
        const formula = q.metadata && q.metadata.computedFormula;
        if (!formula || String(formula).trim() === '') {
          qErrors.questionText = 'Computed field requires a formula';
          isValid = false;
        }
      }
      if (fn && fieldNameCounts[fn] > 1) {
        qErrors.fieldName = 'Field name must be unique across the form';
        isValid = false;
      }
      if (Object.keys(qErrors).length > 0) {
        newErrors[q.id] = qErrors;
      }
    });

    setValidationErrors(newErrors);
    return isValid;
  };

  const handleSave = () => {
    if (formDef && activityId) {
      if (validateForm()) {
        saveFormDefinition(activityId, formDef);
        setIsSaved(true);
        alert('Form definition saved successfully!');
      } else {
        alert('Please fix the errors highlighted in red before saving.');
      }
    }
  };

  const updateFormDef = (newFormDef: FormDefinition) => {
    setFormDef(JSON.parse(JSON.stringify(newFormDef)));
  };

  const addPage = () => {
    if (!formDef) return;
    const newPage: FormPage = {
      id: `page${Date.now()}`,
      name: `Page ${formDef.pages.length + 1}`,
      sections: [{ id: `sec${Date.now()}`, name: 'New Section', questions: [] }]
    };
    const newFormDef = { ...formDef, pages: [...formDef.pages, newPage] };
    updateFormDef(newFormDef);
    setActivePageIndex(formDef.pages.length);
  };

  const deletePage = (pageIndex: number) => {
    if (!formDef) return;
    if ((formDef.pages || []).length <= 1) { alert('Cannot delete the last page.'); return; }
    if (!confirm('Delete this page and all its sections/questions? This action cannot be undone.')) return;
    const newPages = (formDef.pages || []).slice();
    newPages.splice(pageIndex, 1);
    const newFormDef = { ...formDef, pages: newPages };
    updateFormDef(newFormDef);
    // Adjust active page index safely
    if (activePageIndex >= newPages.length) setActivePageIndex(Math.max(0, newPages.length - 1));
    else if (pageIndex < activePageIndex) setActivePageIndex(activePageIndex - 1);
  };

  const addSection = (pageIndex: number) => {
    if (!formDef) return;
    const newSection: FormSection = {
      id: `sec${Date.now()}`,
      name: 'New Section',
      questions: []
    };
    const newFormDef = { ...formDef };
    newFormDef.pages[pageIndex].sections.push(newSection);
    updateFormDef(newFormDef);
  };

  const moveSection = (pageIndex: number, sectionIndex: number, direction: 'up' | 'down') => {
    if (!formDef) return;
    const sections = formDef.pages[pageIndex].sections;
    if (direction === 'up' && sectionIndex > 0) {
      [sections[sectionIndex], sections[sectionIndex - 1]] = [sections[sectionIndex - 1], sections[sectionIndex]];
    } else if (direction === 'down' && sectionIndex < sections.length - 1) {
      [sections[sectionIndex], sections[sectionIndex + 1]] = [sections[sectionIndex + 1], sections[sectionIndex]];
    }
    updateFormDef({ ...formDef });
  };

  const addQuestion = (pageIndex: number, sectionIndex: number, type: AnswerType) => {
    if (!formDef || !activityId) return;
    const newQuestion: Question = {
      id: `q${Date.now()}`,
      activityId,
      pageName: formDef.pages[pageIndex].name,
      sectionName: formDef.pages[pageIndex].sections[sectionIndex].name,
      questionText: 'New Question',
      answerType: type,
      columnSize: 12,
      required: false,
      status: 'Active',
      createdBy: currentUser?.id ?? null,
      fieldName: makeFieldName('New Question') + `_${Date.now()}`,
      options: (type === AnswerType.DROPDOWN || type === AnswerType.RADIO || type === AnswerType.CHECKBOX) ? [{ label: 'Option 1', value: '1' }] : undefined,
      metadata: (type === AnswerType.FILE) ? { allowedFileTypes: ['image/*', '.pdf'] } : undefined,
    };
    const newFormDef = { ...formDef };
    newFormDef.pages[pageIndex].sections[sectionIndex].questions.push(newQuestion);
    updateFormDef(newFormDef);
  };

  const updateQuestion = (pageIndex: number, sectionIndex: number, questionIndex: number, updatedQuestion: Partial<Question>) => {
    if (!formDef) return;
    const newFormDef = { ...formDef };
    const question = newFormDef.pages[pageIndex].sections[sectionIndex].questions[questionIndex];
    newFormDef.pages[pageIndex].sections[sectionIndex].questions[questionIndex] = { ...question, ...updatedQuestion };
    updateFormDef(newFormDef);
  };

  const deleteQuestion = (pageIndex: number, sectionIndex: number, questionIndex: number) => {
    if (!formDef) return;
    const newFormDef = { ...formDef };
    newFormDef.pages[pageIndex].sections[sectionIndex].questions.splice(questionIndex, 1);
    updateFormDef(newFormDef);
  };

  const moveQuestion = (pageIndex: number, sectionIndex: number, questionIndex: number, direction: 'up' | 'down') => {
    if (!formDef) return;
    const questions = formDef.pages[pageIndex].sections[sectionIndex].questions;
    if (direction === 'up' && questionIndex > 0) {
      [questions[questionIndex], questions[questionIndex - 1]] = [questions[questionIndex - 1], questions[questionIndex]];
    } else if (direction === 'down' && questionIndex < questions.length - 1) {
      [questions[questionIndex], questions[questionIndex + 1]] = [questions[questionIndex + 1], questions[questionIndex]];
    }
    updateFormDef({ ...formDef });
  };

  // Bulk Import Logic
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !formDef) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const buffer = evt.target?.result;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer as ArrayBuffer);
        const worksheet = workbook.worksheets[0];
        // Read options from second sheet named 'options' (or second worksheet) if present
        const optionsSheet = workbook.getWorksheet('options') || workbook.worksheets[1];
        const optionsMap: Record<string, Array<{ value: string; label: string }>> = {};
        if (optionsSheet) {
          // Expect header row with columns: name, value, label (case-insensitive)
          const optHeaders: string[] = [];
          optionsSheet.getRow(1).eachCell((cell) => optHeaders.push(String(cell.value || '').toLowerCase()));
          const nameIdx = optHeaders.findIndex(h => h === 'name' || h === 'field_name' || h === 'fieldname');
          const valueIdx = optHeaders.findIndex(h => h === 'value');
          const labelIdx = optHeaders.findIndex(h => h === 'label');
          if (nameIdx !== -1 && valueIdx !== -1) {
            optionsSheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
              if (rowNumber === 1) return;
              const name = String(row.getCell(nameIdx + 1).value || '').trim();
              const value = String(row.getCell(valueIdx + 1).value || '').trim();
              const label = labelIdx !== -1 ? String(row.getCell(labelIdx + 1).value || '').trim() : value;
              if (!name) return;
              if (!optionsMap[name]) optionsMap[name] = [];
              optionsMap[name].push({ value, label });
            });
          }
        }
        const data: any[] = [];
        const headers: string[] = [];
        worksheet.getRow(1).eachCell((cell) => headers.push(String(cell.value)));
        worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
          if (rowNumber === 1) return; // skip header
          const rowData: Record<string, any> = {};
          headers.forEach((header, colIdx) => {
            rowData[header] = row.getCell(colIdx + 1).value;
          });
          data.push(rowData);
        });
        const newQuestions: Question[] = data.map((row: any) => {
          const answerType = (row['Type'] && Object.values(AnswerType).includes(row['Type'])) ? row['Type'] as AnswerType : (row['type'] && Object.values(AnswerType).includes(row['type'])) ? row['type'] as AnswerType : AnswerType.TEXT;
          // Compute field name early (used for options lookup)
          let fieldName = row['field_name'] || row['Field Name'] || row['FieldName'] || makeFieldName(row['Question'] || row['question'] || `q_${Math.random().toString(36).substr(2, 4)}`);
          // Page and Section if provided in the spreadsheet
          const pageNameFromRow = row['Page'] || row['page'] || row['page_name'] || null;
          const sectionNameFromRow = row['Section'] || row['section'] || row['section_name'] || null;
          // Parse options: either from inline 'Options' column (value:label|value:label) or from second sheet 'options'
          let options = undefined;
          if ([AnswerType.DROPDOWN, AnswerType.RADIO, AnswerType.CHECKBOX].includes(answerType)) {
            if (row['Options']) {
              options = String(row['Options'])
                .split('|')
                .map((o: string) => {
                  const parts = o.split(':');
                  return { value: (parts[0] || '').trim(), label: (parts[1] || parts[0] || '').trim() };
                });
            } else {
              // try options sheet by field name
              const lookupName = fieldName || (row['field_name'] || row['Field Name'] || row['FieldName']);
              if (lookupName) {
                const key = String(lookupName).trim();
                if (optionsMap[key] && optionsMap[key].length) {
                  options = optionsMap[key];
                }
              }
            }
          }
          // Computed fields and visibility condition
          let metadata: Record<string, any> | undefined = undefined;
          const showIfFromRow = row['ShowIf'] || row['showIf'] || row['Visibility'] || row['visibility'] || row['Visible If'] || null;
          if (answerType === AnswerType.COMPUTED) {
            metadata = { computedFormula: row['calculation'] || row['Calculation'] || '' };
          }
          if (showIfFromRow) {
            metadata = { ...(metadata || {}), showIf: String(showIfFromRow) };
          }
          // parse new fields: score, reviewers_comment (boolean), group_name
          const scoreVal = Number(row['score'] || row['Score'] || 0) || 0;
          const reviewersCommentFlag = String(row['reviewers_comment'] || row['Reviewers_Comment'] || row['reviewersComment'] || '').toLowerCase() === 'true';
          const groupName = row['group_name'] || row['Group Name'] || row['groupName'] || undefined;

          return {
            id: `q${Math.random().toString(36).substr(2, 9)}`,
            activityId: activityId || '',
            pageName: pageNameFromRow || formDef.pages[activePageIndex].name,
            sectionName: sectionNameFromRow || formDef.pages[activePageIndex].sections[0].name,
            questionText: row['Question'] || row['question'] || 'Untitled',
            questionHelper: row['Helper Text'] || row['HelperText'] || row['helper'] || undefined,
            answerType,
            columnSize: Number(row['ColumnSize'] || row['columnSize'] || 12),
            required: String(row['Required'] || row['required'] || '').toLowerCase() === 'true',
            status: 'Active',
            createdBy: null,
            fieldName,
            options,
            metadata: { ...(metadata || {}), score: scoreVal, displayReviewersComment: reviewersCommentFlag },
            questionGroup: groupName
          };
        });
        if (newQuestions.length > 0) {
          // Deep-ish copy of formDef pages/sections to avoid mutating original
          const newFormDef: any = {
            ...formDef,
            pages: (formDef.pages || []).map(p => ({ ...p, sections: (p.sections || []).map(s => ({ ...s, questions: [...(s.questions || [])] })) }))
          };

          for (const q of newQuestions) {
            const targetPageName = q.pageName || (formDef.pages[activePageIndex] && formDef.pages[activePageIndex].name) || `Page ${newFormDef.pages.length + 1}`;
            const targetSectionName = q.sectionName || 'Section 1';

            let page = newFormDef.pages.find((p: any) => String(p.name).trim() === String(targetPageName).trim());
            if (!page) {
              page = { id: `page-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name: targetPageName, sections: [] };
              newFormDef.pages.push(page);
            }

            let section = (page.sections || []).find((s: any) => String(s.name).trim() === String(targetSectionName).trim());
            if (!section) {
              section = { id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name: targetSectionName, questions: [] };
              page.sections.push(section);
            }

            section.questions.push(q);
          }

          updateFormDef(newFormDef);
          setIsImportModalOpen(false);
          alert(`Successfully imported ${newQuestions.length} questions.`);
        } else {
          alert("No valid questions found in file.");
        }
      } catch (err) {
        console.error(err);
        alert("Error parsing file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Generate a sample Excel workbook (primary sheet + options sheet) and trigger download
  const generateSampleTemplate = async () => {
    try {
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet('questions');
      // Header row (added: score, reviewers_comment, group_name)
      sheet.addRow(['Question', 'Type', 'Helper Text', 'field_name', 'Required', 'ColumnSize', 'Page', 'Section', 'ShowIf', 'calculation', 'score', 'reviewers_comment', 'group_name']);
      // Example row
      sheet.addRow(['What is the program name?', 'textbox', 'Enter program title', 'program_name', 'true', 12, 'Main', 'General', '', '', 0, false, 'Programs']);

      const opts = wb.addWorksheet('options');
      opts.addRow(['name', 'value', 'label']);
      opts.addRow(['program_type', 'gov', 'Government']);
      opts.addRow(['program_type', 'ngo', 'NGO']);

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'form_template.xlsx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to generate template', e);
      alert('Failed to generate sample template.');
    }
  };


  if (!activity || !formDef) return <div>Loading...</div>;

  return (
    <div className="space-y-6 pb-0">
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-4">
          <button onClick={() => navigate('/activities')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeftIcon className="h-6 w-6" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{isSaved ? 'Edit Form' : 'Form Builder'}</h1>
            <p className="text-sm text-gray-500">{activity.title}</p>
          </div>
        </div>
        <div className="space-x-2">
          <Button variant="secondary" onClick={() => setIsGuideModalOpen(true)} leftIcon={<QuestionMarkCircleIcon className="h-5 w-5" />}>Guide</Button>
          <Button variant="secondary" onClick={() => setIsImportModalOpen(true)} leftIcon={<ArrowUpTrayIcon className="h-5 w-5" />}>Bulk Import</Button>
          <Button onClick={handleSave}>{isSaved ? 'Update Form' : 'Save Form'}</Button>
        </div>
      </div>

      {/* Tabs for Pages */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-4 overflow-x-auto" aria-label="Tabs">
          {(formDef.pages || []).map((page, index) => (
            <div key={page.id} className="flex items-center space-x-2">
              <button
                onClick={() => setActivePageIndex(index)}
                className={`${index === activePageIndex
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  } whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center`}
              >
                <input
                  type="text"
                  value={page.name}
                  onChange={(e) => {
                    const newDef = { ...formDef };
                    newDef.pages[index].name = e.target.value;
                    updateFormDef(newDef);
                  }}
                  className="bg-transparent border-none focus:ring-0 p-0 font-medium text-sm w-24"
                />
              </button>
              <button title="Delete page" onClick={(ev) => { ev.stopPropagation(); deletePage(index); }} className="text-red-500 hover:text-red-700 p-1 rounded">
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            onClick={addPage}
            className="border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm flex items-center"
          >
            <PlusIcon className="h-4 w-4 mr-1" /> New Page
          </button>
        </nav>
      </div>

      {/* Sections */}
      <div className="space-y-8">
        {(formDef.pages?.[activePageIndex]?.sections || []).map((section, sIdx) => (
          <div key={section.id} className="bg-white shadow rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex justify-between items-center">
              <input
                type="text"
                value={section.name}
                onChange={(e) => {
                  const newDef = { ...formDef };
                  newDef.pages[activePageIndex].sections[sIdx].name = e.target.value;
                  updateFormDef(newDef);
                }}
                className="bg-transparent border-none focus:ring-0 font-medium text-gray-900 w-1/2"
              />
              <div className="flex space-x-2">
                <button onClick={() => moveSection(activePageIndex, sIdx, 'up')} disabled={sIdx === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowUpIcon className="h-5 w-5" /></button>
                <button onClick={() => moveSection(activePageIndex, sIdx, 'down')} disabled={sIdx === formDef.pages[activePageIndex].sections.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowDownIcon className="h-5 w-5" /></button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {(section.questions || []).map((question, qIdx) => (
                <QuestionEditor
                  key={question.id}
                  question={question}
                  pIdx={activePageIndex}
                  sIdx={sIdx}
                  qIdx={qIdx}
                  isFirst={qIdx === 0}
                  isLast={qIdx === section.questions.length - 1}
                  errors={validationErrors[question.id]}
                  moveQuestion={moveQuestion}
                  deleteQuestion={deleteQuestion}
                  updateQuestion={updateQuestion}
                  onOpenDatasetModal={(p, s, q) => { setDsSelectedForQuestion({ pIdx: p, sIdx: s, qIdx: q }); setIsDatasetModalOpen(true); setDatasetsList([]); }}
                />
              ))}

              {(section.questions || []).length === 0 && <div className="text-center text-gray-400 py-4 text-sm">No questions in this section.</div>}

              <div className="mt-4 flex flex-wrap gap-2 justify-center border-t border-gray-100 pt-4">
                {Object.values(AnswerType).map(type => (
                  <button
                    key={type}
                    onClick={() => addQuestion(activePageIndex, sIdx, type)}
                    className="inline-flex items-center px-2.5 py-1.5 border border-gray-300 shadow-sm text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
                  >
                    + {type}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}

        <Button variant="secondary" onClick={() => addSection(activePageIndex)} className="w-full border-dashed">
          <PlusIcon className="h-5 w-5 mr-2" /> Add Section
        </Button>
      </div>

      <Modal size="2xl" isOpen={isImportModalOpen} onClose={() => setIsImportModalOpen(false)} title="Bulk Import Questions" footer={<Button onClick={() => setIsImportModalOpen(false)}>Close</Button>}>
        <div className="space-y-4 text-sm text-gray-700">
          <p>Upload an Excel file (.xlsx) to bulk-create questions. The workbook should include a header row on the primary worksheet and an optional second worksheet named <strong>options</strong> to supply choices for selection fields. Supported columns on the primary sheet (case-insensitive):</p>
          <ul className="list-disc ml-6">
            <li><strong>Question</strong> (required) — question text.</li>
            <li><strong>Type</strong> — one of: textbox, textarea, number, date, time, dropdown, radio, checkbox, file, computed.</li>
            <li><strong>Helper Text</strong> — optional helper or hint text.</li>
            <li><strong>Options</strong> — (DEPRECATED inline format) Options must be supplied via a separate worksheet named <strong>options</strong>. The <strong>options</strong> worksheet should contain the columns: <code>name</code> (the target question's <em>field_name</em>), <code>value</code>, and <code>label</code>. Add one row per option; multiple rows with the same <code>name</code> will attach multiple options to the same question. Example rows:
              <div className="ml-4 mt-2">
                <code>program_type,gov,Government</code><br />
                <code>program_type,ngo,NGO</code>
              </div>
            </li>
            <li><strong>Required</strong> — "true" or "false" (optional). Marks the question as mandatory when true.</li>
            <li><strong>ColumnSize</strong> — numeric; recommended values: 12 (full), 6 (half), 4 (third), 3 (quarter). Default is 12.</li>
            <li><strong>field_name</strong> — (for computed only) non-spaced field name to reference in formulas.</li>
            <li><strong>calculation</strong> — (for computed only) mathematical formula using field names, obeying BODMAS. Example: <code>age + score * 2</code></li>
            <li><strong>Page</strong> — optional: name of the page (tab) to place the question on. If omitted, the currently active page is used.</li>
            <li><strong>Section</strong> — optional: name of the section inside the page to place the question. If omitted, the first section of the page is used.</li>
            <li><strong>ShowIf</strong> — optional: visibility/conditional expression that controls whether the question is shown. Use the target question's <code>field_name</code> identifiers and a JavaScript-like expression. Examples: <code>age &gt; 18</code>, <code>facility === 'Nairobi' &amp;&amp; score &gt;= 50</code>, or <code>!!name</code>. If omitted or invalid, the question will be visible by default.</li>
            <li><strong>score</strong> — optional numeric score assigned to the question (used for summary scoring). Default: 0.</li>
            <li><strong>reviewers_comment</strong> — optional boolean (true/false). When true, a Reviewer's Comment textarea will be shown below the question for reviewers to add notes.</li>
            <li><strong>group_name</strong> — optional: logical grouping name for this question (e.g., Programs, Demographics). Stored as the question's group and useful for reporting/aggregation.</li>
          </ul>
          <button onClick={generateSampleTemplate} className="inline-block mb-2 text-primary-600 hover:underline text-sm font-medium" style={{ marginTop: 8 }}>Download sample template (Excel .xlsx)</button>
          <p className="text-xs text-gray-500">When importing, if your sheet provides <strong>Page</strong> and/or <strong>Section</strong> columns those values will be used to place questions into matching pages and sections (new pages/sections will be created when necessary). If Page/Section are omitted, questions will be added to the currently active page and its first section. You can edit assignments after import.</p>
          <input type="file" accept=".xlsx" onChange={handleFileImport} className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100" />
          <div className="text-xs text-gray-500">Notes: empty rows are ignored. Options must be provided via the <strong>options</strong> worksheet (one option per row). For computed fields, provide <code>field_name</code> and <code>calculation</code> columns. If Type is missing or invalid, the question will default to <code>textbox</code>.</div>
        </div>
      </Modal>

      <Modal size="2xl" isOpen={isGuideModalOpen} onClose={() => setIsGuideModalOpen(false)} title="Form Builder Guide" footer={<Button onClick={() => setIsGuideModalOpen(false)}>Close</Button>}>
        <div className="space-y-2 text-sm text-gray-700">
          <p><strong>Pages & Sections:</strong> Organize your form into pages (tabs) and sections.</p>
          <p><strong>Questions:</strong> Add various question types using the buttons at the bottom of each section.</p>
          <p><strong>Options:</strong> For Dropdown, Radio, and Checkbox, provide options via the separate <strong>options</strong> worksheet in the Excel template (preferred) or paste options into a question's Options field when editing. The worksheet should have columns <code>name</code> (field_name), <code>value</code>, <code>label</code>.</p>
          <p><strong>Computed Fields:</strong> Use the <code>Computed</code> question type to create fields calculated from other fields. Assign a unique <em>Field Name</em> and enter a formula using those names (e.g. <code>field_a + field_b * 2</code>).</p>
          <p><strong>Visibility / Conditional Logic:</strong> To make a question appear only under certain conditions, expand that question in the Form Builder and edit the <strong>Visibility Condition (Show If)</strong> field under the question's advanced settings. Enter a JavaScript-like expression referencing other questions by their <em>Field Name</em>. Examples: <code>age &gt; 18</code>, <code>facility === 'Nairobi' &amp;&amp; score &gt;= 50</code>, or <code>!!name</code> (shows when name is non-empty).</p>
          <p><strong>Validation:</strong> Questions marked with <span className="text-red-500">*</span> must have text, and selection types must have options.</p>
        </div>
      </Modal>
      {/* Dataset selector modal (uses page-level state) */}
      <Modal size="lg" isOpen={isDatasetModalOpen} onClose={() => { setIsDatasetModalOpen(false); setSelectedDatasetId(null); setDatasetSampleRows([]); setSelectedLabelField(''); setSelectedValueField(''); }} title="Load Options From Dataset">
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Select a dataset</h3>
              <button className="text-sm text-gray-500" onClick={async () => {
                setDsLoading(true);
                try {
                  const r = await fetch('/api/admin/datasets');
                  const j = await r.json();
                  setDatasetsList(Array.isArray(j) ? j : []);
                } catch (e) { console.error('Failed to fetch datasets', e); setDatasetsList([]); }
                setDsLoading(false);
              }}>Refresh</button>
            </div>
            <div className="mt-2">
              {dsLoading && <div className="text-sm text-gray-500">Loading...</div>}
              {!dsLoading && datasetsList.length === 0 && <div className="text-sm text-gray-400">No datasets found. Create datasets in Settings → Datasets.</div>}
              {!dsLoading && datasetsList.length > 0 && (
                <div className="space-y-2 max-h-40 overflow-auto">
                  {datasetsList.map(ds => (
                    <div key={ds.id} className={`p-2 border rounded ${selectedDatasetId === ds.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200'}`} onClick={async () => {
                      setSelectedDatasetId(ds.id);
                      // fetch sample rows and fields
                      try {
                        const detailsRes = await fetch(`/api/admin/datasets/${ds.id}`);
                        const details = await detailsRes.json();
                        let fields: string[] = [];
                        if (Array.isArray(details.dataset_fields) && details.dataset_fields.length) {
                          fields = details.dataset_fields.map((f:any) => f.name).filter(Boolean);
                        }
                        const contentRes = await fetch(`/api/admin/datasets/${ds.id}/content?limit=50`);
                        const contentJson = await contentRes.json();
                        const sampleRows = Array.isArray(contentJson.rows) ? contentJson.rows.map((rr:any) => rr.dataset_data || {}) : [];
                        setDatasetSampleRows(sampleRows || []);
                        // If no dataset_fields, infer from sample
                        if (!fields.length) {
                          const inferred = new Set<string>();
                          (sampleRows || []).slice(0,5).forEach((r:any) => { if (r && typeof r === 'object') Object.keys(r).forEach(k => inferred.add(k)); });
                          fields = Array.from(inferred);
                        }
                        // populate selects defaults
                        setSelectedLabelField(fields[0] || '');
                        setSelectedValueField(fields[0] || '');
                      } catch (e) { console.error(e); setDatasetSampleRows([]); setSelectedLabelField(''); setSelectedValueField(''); }
                    }}>
                      <div className="text-sm font-medium">{ds.name}</div>
                      <div className="text-xs text-gray-500">{ds.description}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500">Label Field</label>
            <select className="mt-1 block w-full border-gray-300 rounded" value={selectedLabelField} onChange={e => setSelectedLabelField(e.target.value)}>
              <option value="">-- select --</option>
              {(() => {
                // build options from sample rows keys
                const keys = new Set<string>();
                datasetSampleRows.slice(0,10).forEach(r => { if (r && typeof r === 'object') Object.keys(r).forEach(k => keys.add(k)); });
                return Array.from(keys).map(k => <option key={k} value={k}>{k}</option>);
              })()}
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-500">Value Field</label>
            <select className="mt-1 block w-full border-gray-300 rounded" value={selectedValueField} onChange={e => setSelectedValueField(e.target.value)}>
              <option value="">-- select --</option>
              {(() => {
                const keys = new Set<string>();
                datasetSampleRows.slice(0,10).forEach(r => { if (r && typeof r === 'object') Object.keys(r).forEach(k => keys.add(k)); });
                return Array.from(keys).map(k => <option key={k} value={k}>{k}</option>);
              })()}
            </select>
          </div>

          <div className="text-sm text-gray-500">Preview (first 5 rows):</div>
          <div className="max-h-40 overflow-auto bg-white border rounded p-2">
            {datasetSampleRows.length === 0 && <div className="text-xs text-gray-400">No sample rows available.</div>}
            {datasetSampleRows.length > 0 && (
              <table className="w-full text-xs table-auto">
                <thead>
                  <tr>{Object.keys(datasetSampleRows[0] || {}).map(k => <th key={k} className="px-1 text-left font-semibold">{k}</th>)}</tr>
                </thead>
                <tbody>
                  {datasetSampleRows.slice(0,5).map((r, idx) => (
                    <tr key={idx} className="border-t"><td className="px-1">{Object.values(r).map((v:any,i:number)=> <div key={i} className="truncate max-w-xs">{String(v ?? '')}</div>)}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex justify-end space-x-2">
            <Button variant="secondary" onClick={() => { setIsDatasetModalOpen(false); setSelectedDatasetId(null); setDatasetSampleRows([]); }}>Cancel</Button>
            <Button onClick={async () => {
              if (!dsSelectedForQuestion) return alert('No question selected');
              if (!selectedDatasetId) return alert('Select a dataset');
              if (!selectedLabelField || !selectedValueField) return alert('Choose label and value fields');
              // build options from sample rows
              try {
                const res = await fetch(`/api/admin/datasets/${selectedDatasetId}/content?limit=100`);
                const j = await res.json();
                const rows = Array.isArray(j.rows) ? j.rows.map((r:any) => (r.dataset_data ? r.dataset_data : r.dataset_data === undefined ? {} : {})) : [];
                const opts = (rows || []).map((r:any) => ({ label: String(r[selectedLabelField] ?? ''), value: String(r[selectedValueField] ?? '') })).filter(o => o.value !== '');
                // update the target question's options
                updateQuestion(dsSelectedForQuestion.pIdx, dsSelectedForQuestion.sIdx, dsSelectedForQuestion.qIdx, { options: opts });
                setIsDatasetModalOpen(false);
              } catch (e) { console.error('Failed to build options from dataset', e); alert('Failed to build options from dataset'); }
            }}>Insert Options</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BuildFormPage;