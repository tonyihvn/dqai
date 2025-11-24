import React, { useState } from 'react';
import { useParams, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { useMockData } from '../hooks/useMockData';
import { FormDefinition, Question, AnswerType, UploadedFile, ActivityReport } from '../types';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import MInput from '../components/ui/MInput';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';
import * as ExcelJS from 'exceljs';

const RenderQuestion = ({ question, value, onChange }: { question: Question, value: any, onChange: (value: any) => void }) => {
    switch (question.answerType) {
        case AnswerType.TEXT:
            return <MInput label={question.questionText} type="text" value={value || ''} onChange={onChange} />;
        case AnswerType.TEXTAREA:
            return <MInput label={question.questionText} type="textarea" value={value || ''} onChange={onChange} rows={4} />;
        case AnswerType.NUMBER:
            return <MInput label={question.questionText} type="number" value={value || ''} onChange={onChange} />;
        case AnswerType.DATE:
            return <MInput label={question.questionText} type="date" value={value || ''} onChange={onChange} />;
        case AnswerType.TIME:
            return <MInput label={question.questionText} type="time" value={value || ''} onChange={onChange} />;
        case AnswerType.DROPDOWN:
            return (
                <MInput
                    label={question.questionText}
                    type="select"
                    value={value || ''}
                    onChange={onChange}
                    options={(question.options || []).map(o => ({ value: o.value as any, label: o.label }))}
                    placeholder="Select..."
                />
            );
        case AnswerType.RADIO:
            return (
                <div>
                    {question.options?.map((opt, idx) => (
                        <MInput key={idx} type="radio" name={question.id} label={opt.label} value={value === opt.value} onChange={(v) => onChange(opt.value)} />
                    ))}
                </div>
            );
        case AnswerType.CHECKBOX:
            const currentVals = Array.isArray(value) ? value : [];
            const handleCheck = (val: string, checked: boolean) => {
                if (checked) onChange([...currentVals, val]);
                else onChange(currentVals.filter((v: string) => v !== val));
            };
            return (
                <div>
                    {question.options?.map((opt, idx) => (
                        <MInput key={idx} type="checkbox" name={`${question.id}-${idx}`} label={opt.label} value={currentVals.includes(opt.value)} onChange={(v) => handleCheck(opt.value as string, v)} />
                    ))}
                </div>
            );
        case AnswerType.FILE:
            const allowed = question.metadata && Array.isArray(question.metadata.allowedFileTypes) ? question.metadata.allowedFileTypes.join(',') : undefined;
            const fileVal = value;
            const handleFile = (files: FileList | null) => {
                const f = files?.[0] || null;
                if (!f) return onChange(null);
                const reader = new FileReader();
                reader.onload = (ev) => {
                    const dataUrl = ev.target?.result as string;
                    onChange({ filename: f.name, mimeType: f.type, dataUrl });
                };
                reader.readAsDataURL(f);
            };
            return (
                <div>
                    <MInput type="file" label={question.questionText} onChange={(files) => handleFile(files)} />
                    {fileVal && fileVal.dataUrl && fileVal.dataUrl !== '' && (
                        <div className="mt-2">
                            <div className="text-xs text-gray-500">Uploaded: {fileVal.filename}</div>
                            {fileVal.mimeType && fileVal.mimeType.startsWith('image/') && fileVal.dataUrl && (
                                <img src={fileVal.dataUrl} alt={fileVal.filename} className="mt-2 max-h-36 border rounded" />
                            )}
                        </div>
                    )}
                </div>
            );
        case AnswerType.COMPUTED:
            // Show computed/calculated value as read-only output.
            // If a function is present, try to invoke it safely to get the result; otherwise display the value as a string.
            let displayValue: any = value;
            if (typeof displayValue === 'function') {
                try {
                    const res = displayValue();
                    displayValue = (res === undefined || res === null) ? String(displayValue) : res;
                } catch (e) {
                    // if calling fails, fall back to string representation
                    displayValue = String(displayValue);
                }
            }
            // If the value is a string that looks like JS source (arrow or function), try to extract a trailing primitive result.
            if (typeof displayValue === 'string' && /=>|function\s*\(/.test(displayValue)) {
                // Attempt to extract text after the last closing brace '}' which commonly contains the computed result when stringified
                const after = displayValue.replace(/^[\s\S]*}\s*/, '').trim();
                if (after) {
                    // If it's a plain number, coerce to Number
                    if (/^-?\d+(?:\.\d+)?$/.test(after)) displayValue = Number(after);
                    else {
                        try { displayValue = JSON.parse(after); } catch (e) { displayValue = after; }
                    }
                } else {
                    // No trailing primitive; don't show raw JS source — present as empty so placeholder appears
                    displayValue = null;
                }
            }
            const isEmpty = displayValue === undefined || displayValue === null || displayValue === '';
            return (
                <div className="bg-gray-100 border border-gray-200 rounded px-3 py-2 text-gray-700">
                    <span className="font-semibold">{question.questionText}:</span>{' '}
                    <span>{isEmpty ? <span className="italic text-gray-400">(no value)</span> : String(displayValue)}</span>
                </div>
            );
        default:
            return <p className="text-sm text-gray-500">Not supported</p>;
    }
};

import DataTable from '../components/ui/DataTable';

const EditableTable = ({ file, onUpdate }: { file: UploadedFile; onUpdate: (updatedFile: UploadedFile) => void }) => {
    if (!file.data || file.data.length === 0) {
        return <p className="text-gray-500">No data to display for {file.fileName}.</p>;
    }
    const set = new Set<string>();
    file.data.forEach(r => Object.keys(r).forEach(k => set.add(k)));
    const headers = Array.from(set);

    const columns = headers.map(h => ({ key: h, label: h, editable: true }));

    const handleCellEdit = (rowIndex: number, key: string, newValue: any) => {
        const newData = [...file.data];
        newData[rowIndex] = { ...newData[rowIndex], [key]: newValue };
        onUpdate({ ...file, data: newData });
    };

    return (
        <div>
            <h4 className="font-semibold text-lg mb-2">{file.fileName}</h4>
            <DataTable columns={columns} data={file.data} onCellEdit={handleCellEdit} />
        </div>
    );
};

interface FillFormPageProps {
    activityIdOverride?: string;
    standaloneMode?: boolean;
}

const FillFormPage: React.FC<FillFormPageProps> = ({ activityIdOverride, standaloneMode }) => {
    const { activityId: activityIdParam } = useParams<{ activityId: string }>();
    const history = useNavigate();
    const activityId = activityIdOverride || activityIdParam;
    const { getActivity, saveReport, currentUser, facilities, users, reports } = useMockData();
    const activity = getActivity(activityId || '');
    const formDef: FormDefinition | undefined = activity?.formDefinition;

    // Redirect to login if not authenticated
    if (!currentUser && !standaloneMode) return <Navigate to="/login" replace />;

    const [answers, setAnswers] = useState<Record<string, any>>({});
    const [formSubmitted, setFormSubmitted] = useState(false);
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const [activePageIndex, setActivePageIndex] = useState(0);
    const [editingReport, setEditingReport] = useState<ActivityReport | undefined>(undefined);

    const location = useLocation();
    const search = new URLSearchParams(location.search);
    const qReportId = search.get('reportId');

    const handleAnswerChange = (questionId: string, value: any) => {
        setAnswers(prev => ({ ...prev, [questionId]: value }));
    };

    // Helpers for computed fields
    const parseDate = (v: any): Date | null => {
        if (!v) return null;
        if (v instanceof Date) return v;
        const s = String(v);
        const d = new Date(s);
        if (isNaN(d.getTime())) return null;
        return d;
    };

    const age = (v: any): number | null => {
        const d = parseDate(v);
        if (!d) return null;
        const now = new Date();
        let yrs = now.getFullYear() - d.getFullYear();
        const m = now.getMonth() - d.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < d.getDate())) yrs--;
        return yrs;
    };

    const diffDays = (a: any, b: any): number | null => {
        const da = parseDate(a);
        const db = parseDate(b);
        if (!da || !db) return null;
        const diff = Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24));
        return diff;
    };

    const evaluateFormula = (formula: string, fieldMap: Record<string, any>) => {
        if (!formula || typeof formula !== 'string') return null;
        try {
            const varNames = Object.keys(fieldMap || {});
            const args = varNames.map(n => {
                const v = fieldMap[n];
                // try to coerce numeric strings to numbers
                if (typeof v === 'string' && /^-?\d+(?:\.\d+)?$/.test(v)) return Number(v);
                return v;
            });
            // Provide helpers: age, parseDate, diffDays
            // Build function: function(...vars, age, parseDate, diffDays) { return <formula>; }
            // eslint-disable-next-line no-new-func
            const fn = new Function(...varNames, 'age', 'parseDate', 'diffDays', `try { return ${formula}; } catch(e){ return null; }`);
            return fn(...args, age, parseDate, diffDays);
        } catch (err) {
            console.error('Error evaluating formula', formula, err);
            return null;
        }
    };

    // Recompute computed fields only when formDef changes or answers for non-computed fields change
    React.useEffect(() => {
        if (!formDef) return;
        // build fieldName -> value map from current answers
        const fieldMap: Record<string, any> = {};
        formDef.pages.forEach(p => p.sections.forEach(s => s.questions.forEach(q => {
            if (q.fieldName) {
                fieldMap[q.fieldName] = answers[q.id];
            }
        })));

        // compute values for computed questions
        let updated: Record<string, any> | null = null;
        formDef.pages.forEach(p => p.sections.forEach(s => s.questions.forEach(q => {
            if (q.answerType === AnswerType.COMPUTED) {
                const formula = q.metadata && q.metadata.computedFormula;
                if (formula) {
                    const result = evaluateFormula(String(formula), fieldMap);
                    // set into updated map by question id if changed
                    if (result !== answers[q.id]) {
                        if (!updated) updated = { ...answers };
                        updated[q.id] = result;
                        // also update fieldMap so dependent computed fields can use it
                        if (q.fieldName) fieldMap[q.fieldName] = result;
                    }
                }
            }
        })));

        if (updated) {
            setAnswers(updated);
        }
        // Only run when formDef changes or non-computed answers change
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formDef, JSON.stringify(Object.fromEntries(Object.entries(answers).filter(([k]) => {
        // Only include non-computed question answers in dependency
        if (!formDef) return true;
        for (const p of formDef.pages) for (const s of p.sections) for (const q of s.questions) if (q.id === k && q.answerType === AnswerType.COMPUTED) return false;
        return true;
    })))]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Validate required fields
        const missing: string[] = [];
        if (formDef) {
            for (const p of formDef.pages) {
                for (const s of p.sections) {
                    for (const q of s.questions) {
                        if (q.required) {
                            const val = answers[q.id];
                            if (val === undefined || val === null || (typeof val === 'string' && val.trim() === '') || (Array.isArray(val) && val.length === 0)) {
                                missing.push(q.questionText || q.id);
                            }
                        }
                    }
                }
            }
        }
        if (missing.length > 0) {
            alert('Please answer required questions before proceeding:\n' + missing.join('\n'));
            return;
        }
        setFormSubmitted(true);
        window.scrollTo(0, 0);
    };

    const [selectedFacilityId, setSelectedFacilityId] = useState<number | undefined>(currentUser?.facilityId || undefined);
    const [selectedUserId, setSelectedUserId] = useState<number | undefined>(currentUser?.id || undefined);

    const handleFinalize = () => {
        // Enforce required linking field based on activity.responseType
        const respType = (activity.responseType || '').toString().toLowerCase();
        if (respType === 'facility' && !selectedFacilityId) {
            alert('This activity requires a Facility to be selected before finalizing.');
            return;
        }
        if (respType === 'user' && !selectedUserId) {
            alert('This activity requires a User to be selected before finalizing.');
            return;
        }

        (async () => {
            try {
                // Create the report first without embedding base64 file data so server returns an id
                const payloadBase: any = {
                    activityId: activityId,
                    userId: selectedUserId || currentUser?.id,
                    facilityId: selectedFacilityId || currentUser?.facilityId,
                    status: 'Pending',
                    answers: {}
                };
                // copy answers but strip out any dataUrl content so we can upload them separately
                const strippedAnswers: Record<string, any> = {};
                const fileAnswerMap: Array<{ qid: string; filename: string; mimeType?: string; dataUrl: string }> = [];
                for (const [qid, val] of Object.entries(answers)) {
                    if (val && typeof val === 'object' && (val.dataUrl || val.data)) {
                        // collect for upload after report is created
                        const filename = val.filename || `file_${Date.now()}`;
                        const mimeType = val.mimeType || val.type || '';
                        const dataUrl = val.dataUrl || val.data || '';
                        fileAnswerMap.push({ qid, filename, mimeType, dataUrl });
                        // leave a placeholder in answers
                        strippedAnswers[qid] = { filename };
                    } else {
                        strippedAnswers[qid] = val;
                    }
                }
                payloadBase.answers = strippedAnswers;

                // create report on server
                const createRes = await fetch('/api/reports', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payloadBase) });
                if (!createRes.ok) {
                    alert('Failed to create report');
                    return;
                }
                const created = await createRes.json();
                const reportId = created.id || created.activity_reports_id || null;

                // upload any file answers to /api/review_uploads so they are written to disk and associated with the report
                const updatedAnswers = { ...strippedAnswers };
                for (const fa of fileAnswerMap) {
                    try {
                        const upRes = await fetch('/api/review_uploads', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reportId, filename: fa.filename, contentBase64: fa.dataUrl, mimeType: fa.mimeType }) });
                        if (upRes.ok) {
                            const uj = await upRes.json();
                            // replace placeholder with returned url
                            updatedAnswers[fa.qid] = { url: uj.url, filename: fa.filename };
                        } else {
                            // leave placeholder filename if upload failed
                            updatedAnswers[fa.qid] = { filename: fa.filename };
                        }
                    } catch (e) {
                        console.error('File upload failed', e);
                        updatedAnswers[fa.qid] = { filename: fa.filename };
                    }
                }

                // If we changed any answers to include URLs, send an update to the report
                try {
                    await fetch(`/api/reports/${reportId}`, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: updatedAnswers }) });
                } catch (e) { console.error('Failed to update report answers with uploaded file URLs', e); }

                alert('Data successfully submitted!');
                history('/reports');
            } catch (err) {
                console.error('Finalize error', err);
                alert('Failed to submit data');
            }
        })();
    }

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        Array.from(files).forEach((file: File) => {
            const reader = new FileReader();
            reader.onload = async (evt) => {
                try {
                    const buffer = evt.target?.result;
                    const workbook = new ExcelJS.Workbook();
                    await workbook.xlsx.load(buffer as ArrayBuffer);
                    const worksheet = workbook.worksheets[0];
                    const data: Record<string, any>[] = [];
                    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                        if (rowNumber === 1) return; // skip header
                        const rowData: Record<string, any> = {};
                        worksheet.getRow(1).eachCell((cell, colNumber) => {
                            rowData[cell.value as string] = row.getCell(colNumber).value;
                        });
                        data.push(rowData);
                    });
                    setUploadedFiles(prev => [...prev, {
                        id: `file-${Date.now()}-${file.name}`,
                        fileName: file.name,
                        data: data
                    }]);
                } catch (err) {
                    console.error("Error parsing file", err);
                    alert(`Could not parse ${file.name}. Please ensure it is a valid Excel file.`);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    };

    const handleFileUpdate = (updatedFile: UploadedFile) => {
        setUploadedFiles(files => files.map(f => f.id === updatedFile.id ? updatedFile : f));
    };

    // If reportId supplied in query params, load existing report for editing
    React.useEffect(() => {
        if (!qReportId) return;
        if (!reports || reports.length === 0) return;
        const rpt = reports.find(r => String(r.id) === String(qReportId));
        if (!rpt) return;
        setEditingReport(rpt);
        // answers may be stored either as an object map or an array of { question_id, answer_value }
        const rawAnswers: any = rpt.answers || rpt.answer || {};
        if (Array.isArray(rawAnswers)) {
            const mapped: Record<string, any> = {};
            rawAnswers.forEach((a: any) => {
                const qid = a.question_id || a.questionId || a.questionId;
                const val = a.answer_value !== undefined ? a.answer_value : a.answer || a.value;
                if (qid) mapped[qid] = val;
            });
            setAnswers(mapped);
        } else {
            setAnswers(rawAnswers || {});
        }
        setUploadedFiles(rpt.uploadedFiles || rpt.uploaded_files || []);
        setSelectedFacilityId((rpt as any).facilityId || undefined);
        setSelectedUserId((rpt as any).userId || undefined);
    }, [qReportId, reports]);

    if (!activity) return <div>Activity not found.</div>;
    // Only allow filling if activity is Published
    if (!standaloneMode && String(activity.status || '').toLowerCase() !== 'published') {
        return <div className="p-6">This activity is not published. Form filling is disabled.</div>;
    }
    if (!formDef || !Array.isArray(formDef.pages) || formDef.pages.length === 0) {
        return <div className="p-6">This activity does not have a form built for it yet. Please contact the administrator.</div>;
    }

    // If editing an existing report that is Completed, do not allow edits for non-admins
    const isCompleted = editingReport && (String(editingReport.status || '').toLowerCase() === 'completed');
    const isAdmin = currentUser && String(currentUser.role || '').toLowerCase() === 'admin';
    if (isCompleted && !isAdmin) {
        return (
            <Card>
                <h2 className="text-lg font-semibold">This response is completed</h2>
                <p className="text-sm text-gray-600 mt-2">This report has been marked as completed and cannot be edited.</p>
            </Card>
        );
    }

    const currentPage = formDef.pages[activePageIndex] || formDef.pages[0];

    return (
        <div className="space-y-6">
            {!standaloneMode && (
                <div className="flex items-center space-x-4">
                    <button onClick={() => history('/activities')} className="text-gray-500 hover:text-gray-700">
                        <ArrowLeftIcon className="h-6 w-6" />
                    </button>
                    <h1 className="text-2xl font-bold text-gray-800">Data Collection: {activity.title}</h1>
                </div>
            )}
            {standaloneMode && (
                <div className="flex items-center justify-center">
                    <h1 className="text-2xl font-bold text-gray-800">{activity.title}</h1>
                </div>
            )}

            {!formSubmitted ? (
                <Card>
                    <form onSubmit={handleSubmit}>
                        <div className="border-b border-gray-200">
                            <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
                                {formDef.pages.map((page, index) => (
                                    <button type="button" key={page.id} onClick={() => setActivePageIndex(index)} className={`${index === activePageIndex ? 'border-primary-500 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm`}>
                                        {page.name}
                                    </button>
                                ))}
                            </nav>
                        </div>

                        <div className="mt-6 space-y-8">
                            {currentPage.sections.map(section => (
                                <div key={section.id} className="bg-gray-50 p-4 rounded-md">
                                    <h3 className="text-lg font-medium text-gray-900 border-b pb-2 border-gray-200">{section.name}</h3>
                                    <div className="mt-4 grid grid-cols-12 gap-6">
                                        {(() => {
                                            // build fieldName -> value map for visibility/computed evaluation
                                            const fieldMapLocal: Record<string, any> = {};
                                            formDef.pages.forEach(p => p.sections.forEach(s => s.questions.forEach(qq => {
                                                if (qq.fieldName) fieldMapLocal[qq.fieldName] = answers[qq.id];
                                            })));

                                            return section.questions.map(q => {
                                                // evaluate visibility condition if present
                                                let visible = true;
                                                try {
                                                    if (q.metadata && q.metadata.showIf) {
                                                        const res = evaluateFormula(String(q.metadata.showIf), fieldMapLocal);
                                                        visible = !!res;
                                                    }
                                                } catch (e) {
                                                    console.error('Error evaluating showIf for question', q.id, e);
                                                    visible = true;
                                                }
                                                if (!visible) return null;

                                                // proceed to render question

                                                // continue below
                                                return (
                                                    (() => {
                                                        let colClass = 'col-span-12';
                                                        if (q.columnSize === 12) colClass = 'col-span-12';
                                                        else if (q.columnSize === 6) colClass = 'md:col-span-6 col-span-12';
                                                        else if (q.columnSize === 4) colClass = 'md:col-span-4 col-span-12';
                                                        else if (q.columnSize === 3) colClass = 'md:col-span-3 col-span-12';
                                                        else colClass = 'col-span-12';
                                                        return (
                                                            <div key={q.id} className={colClass}>
                                                                {/* Render the question input; label is provided by the input component itself to avoid duplication */}
                                                                {q.questionHelper && <p className="text-xs text-gray-500 mb-1">{q.questionHelper}</p>}
                                                                <RenderQuestion question={q} value={answers[q.id]} onChange={(val) => handleAnswerChange(q.id, val)} />
                                                                {/* Show reviewer comment field below if enabled */}
                                                                {q.metadata && q.metadata.displayReviewersComment && (
                                                                    <div className="mt-2">
                                                                        <label className="block text-xs text-gray-600 mb-1">{q.metadata.reviewerCommentLabel || "Reviewer's Comment"}</label>
                                                                        <MInput
                                                                            type="textarea"
                                                                            value={answers[`${q.id}_reviewers_comment`] || ''}
                                                                            onChange={val => handleAnswerChange(`${q.id}_reviewers_comment`, val)}
                                                                            rows={2}
                                                                            placeholder={q.metadata.reviewerCommentLabel || "Reviewer's Comment"}
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })()
                                                );
                                            });
                                        })()}

                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="mt-8 pt-5 border-t border-gray-200">
                            <div className="flex justify-end space-x-3">
                                {activePageIndex > 0 && (
                                    <Button variant="secondary" onClick={e => { e.preventDefault(); setActivePageIndex(p => p - 1); }}>Previous Page</Button>
                                )}
                                {activePageIndex < formDef.pages.length - 1 ? (
                                    <Button onClick={e => { e.preventDefault(); setActivePageIndex(p => Math.min(p + 1, formDef.pages.length - 1)); }}>Next Page</Button>
                                ) : (
                                    <Button type="submit">Next: Upload Files</Button>
                                )}
                            </div>
                        </div>
                    </form>
                </Card>
            ) : (
                <Card title="Step 2: Upload Supporting Files & Review" action={<Button onClick={handleFinalize}>Finalize Submission</Button>}>
                    <div className="space-y-6">
                        <div className="bg-blue-50 p-4 rounded-md">
                            <h3 className="text-sm font-medium text-blue-800">Form Data Saved</h3>
                            <p className="text-sm text-blue-700 mt-1">Your responses have been captured. You can now upload Excel or CSV files related to this activity. You can edit the data in the table below before final submission.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Upload Files</label>
                            <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                                <div className="space-y-1 text-center">
                                    <div className="flex text-sm text-gray-600 justify-center">
                                        <label htmlFor="file-upload" className="relative cursor-pointer bg-white rounded-md font-medium text-primary-600 hover:text-primary-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-primary-500">
                                            <span>Upload CSV or Excel</span>
                                            <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept=".csv, .xlsx, .xls" onChange={handleFileUpload} />
                                        </label>
                                    </div>
                                    <p className="text-xs text-gray-500">Supports .xlsx, .xls, .csv</p>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">

                            <div>
                                {uploadedFiles.map(file => (
                                    <Card key={file.id} className="border border-gray-200 mb-4">
                                        <div className="flex justify-between items-start gap-4">
                                            <div className="flex-1">
                                                <div className="mb-2">
                                                    <label className="block text-xs text-gray-600">File Title</label>
                                                    <input className="p-2 border rounded w-full" value={file.fileName || ''} onChange={e => setUploadedFiles(prev => prev.map(f => f.id === file.id ? { ...f, fileName: e.target.value } : f))} placeholder="Enter title for this file" />
                                                </div>
                                                <EditableTable file={file} onUpdate={handleFileUpdate} />
                                            </div>
                                            <div className="ml-4">
                                                <button onClick={() => { if (confirm('Delete this uploaded file?')) setUploadedFiles(prev => prev.filter(f => f.id !== file.id)); }} className="text-red-600 hover:text-red-900 text-sm">Delete File</button>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700">Link Entity</label>
                                <p className="text-xs text-gray-500 mb-2">Select the facility or user this response should be linked to (required for some activities).</p>
                                {String(activity.responseType || '').toLowerCase() === 'facility' ? (
                                    <select value={selectedFacilityId || ''} onChange={e => setSelectedFacilityId(e.target.value ? Number(e.target.value) : undefined)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                                        <option value="">Select facility...</option>
                                        {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                    </select>
                                ) : String(activity.responseType || '').toLowerCase() === 'user' ? (
                                    <select value={selectedUserId || ''} onChange={e => setSelectedUserId(e.target.value ? Number(e.target.value) : undefined)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                                        <option value="">Select user...</option>
                                        {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}
                                    </select>
                                ) : (
                                    <div className="space-y-2">
                                        <select value={selectedFacilityId || ''} onChange={e => setSelectedFacilityId(e.target.value ? Number(e.target.value) : undefined)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                                            <option value="">(Optional) Select facility...</option>
                                            {facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                                        </select>
                                        <select value={selectedUserId || ''} onChange={e => setSelectedUserId(e.target.value ? Number(e.target.value) : undefined)} className="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                                            <option value="">(Optional) Select user...</option>
                                            {users.map(u => <option key={u.id} value={u.id}>{u.firstName} {u.lastName} ({u.email})</option>)}
                                        </select>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-between border-t pt-4">
                            <Button variant="secondary" onClick={() => setFormSubmitted(false)}>Back to Form</Button>
                        </div>
                    </div>
                </Card>
            )}
        </div>
    );
};

export default FillFormPage;