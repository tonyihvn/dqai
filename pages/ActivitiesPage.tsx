import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMockData } from '../hooks/useMockData';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { confirm, error as swalError, toast as swalToast } from '../components/ui/swal';
import Modal from '../components/ui/Modal';
import RichTextEditor from '../components/ui/RichTextEditor';
import { PlusIcon, PencilIcon, TrashIcon, DocumentTextIcon, PlayIcon } from '@heroicons/react/24/outline';
import { Activity } from '../types';

const ActivitiesPage: React.FC = () => {
  const { activities, programs, saveActivity, deleteActivity, currentUser } = useMockData();
  const navigate = useNavigate();
  const location = useLocation();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentActivity, setCurrentActivity] = useState<Partial<Activity>>({});
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [embedModalOpen, setEmbedModalOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const canEdit = currentUser?.role === 'Admin' || currentUser?.role === 'Form Builder';
  const canCollect = currentUser?.role === 'Admin' || currentUser?.role === 'Data Collector';

  const getProgramName = (programId: string) => {
    return programs.find(p => p.id === programId)?.name || 'N/A';
  };

  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    // handle plain YYYY-MM-DD specially to avoid timezone shifts
    const plainDateMatch = /^\d{4}-\d{2}-\d{2}$/.test(value);
    let d: Date;
    if (plainDateMatch) {
      const [y, m, day] = value.split('-').map(Number);
      d = new Date(Date.UTC(y, m - 1, day));
    } else {
      d = new Date(value);
    }
    if (isNaN(d.getTime())) return String(value);
    const dayNum = d.getUTCDate();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const month = monthNames[d.getUTCMonth()];
    const year = d.getUTCFullYear();
    const suffix = (n: number) => {
      if (n % 100 >= 11 && n % 100 <= 13) return 'th';
      switch (n % 10) {
        case 1: return 'st';
        case 2: return 'nd';
        case 3: return 'rd';
        default: return 'th';
      }
    };
    return `${dayNum}${suffix(dayNum)} ${month}, ${year}`;
  };

  // Optional filter from query string: ?programId=...
  const search = new URLSearchParams(location.search);
  const filterProgramId = search.get('programId');
  const visibleActivities = filterProgramId ? activities.filter(a => String(a.programId) === String(filterProgramId)) : activities;

  const openModal = (activity?: Activity) => {
    setCurrentActivity(activity || { title: '', programId: programs[0]?.id || '', status: 'Draft', startDate: '', endDate: '', responseType: 'Facility' });
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (currentActivity.title && currentActivity.programId) {
      saveActivity({
        ...currentActivity,
        createdBy: currentUser?.id || 'system'
      } as Activity);
      setIsModalOpen(false);
    } else {
      swalError('Missing fields', 'Title and Program are required');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Activities</h1>
        {canEdit && <Button onClick={() => openModal()} leftIcon={<PlusIcon className="h-5 w-5" />}>
          New Activity
        </Button>}
      </div>

      <div className="grid gap-4">
        {visibleActivities.map(activity => (
          <Card key={activity.id}>
            <div className="flex items-start justify-between">
              <div>
                <div className="text-lg font-medium text-gray-900">{activity.title}</div>
                <div className="text-sm text-gray-500">{activity.category} · {getProgramName(activity.programId)}</div>
                <div className="mt-2 text-sm text-gray-500">{(activity as any).responseType || (activity as any).response_type || '—'} · {formatDate(activity.startDate)} - {formatDate(activity.endDate)}</div>
              </div>
              <div className="flex items-start gap-2">
                <div className="flex flex-col items-end space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {canCollect && <Button size="sm" variant="primary" onClick={() => navigate(`/activities/fill/${activity.id}`)} leftIcon={<PlayIcon className="h-4 w-4" />}>Collect</Button>}
                    {/* Keep Build/Edit visible on very small screens */}
                    <div className="sm:hidden">
                      {canEdit && (() => {
                        const hasForm = Boolean(activity.formDefinition && Array.isArray(activity.formDefinition.pages) && activity.formDefinition.pages.some(p => p.sections && p.sections.some(s => (s.questions || []).length > 0)));
                        return hasForm ? (
                          <Button size="sm" variant="secondary" onClick={() => navigate(`/activities/build/${activity.id}`)} leftIcon={<DocumentTextIcon className="h-4 w-4" />}>Edit Form</Button>
                        ) : (
                          <Button size="sm" variant="primary" onClick={() => navigate(`/activities/build/${activity.id}`)} leftIcon={<DocumentTextIcon className="h-4 w-4" />}>Build Form</Button>
                        );
                      })()}
                    </div>
                    <div className="hidden sm:flex sm:flex-wrap sm:gap-2">
                      {canEdit && (
                        <>
                          {(() => {
                            const hasForm = Boolean(activity.formDefinition && Array.isArray(activity.formDefinition.pages) && activity.formDefinition.pages.some(p => p.sections && p.sections.some(s => (s.questions || []).length > 0)));
                            return hasForm ? (
                              <Button size="sm" variant="secondary" onClick={() => navigate(`/activities/build/${activity.id}`)} leftIcon={<DocumentTextIcon className="h-4 w-4" />}>Edit Form</Button>
                            ) : (
                              <Button size="sm" variant="primary" onClick={() => navigate(`/activities/build/${activity.id}`)} leftIcon={<DocumentTextIcon className="h-4 w-4" />}>Build Form</Button>
                            );
                          })()}
                          <Button size="sm" variant="secondary" onClick={() => navigate(`/reports/builder?activityId=${activity.id}`)} leftIcon={<DocumentTextIcon className="h-4 w-4" />}>Build Report</Button>
                          <Button size="sm" variant="secondary" onClick={() => navigate(`/activities/dashboard/${activity.id}`)} leftIcon={<DocumentTextIcon className="h-4 w-4" />}>View Data</Button>
                          <Button size="sm" variant="secondary" onClick={() => openModal(activity)} leftIcon={<PencilIcon className="h-4 w-4" />}>Edit</Button>
                          <Button size="sm" variant="danger" onClick={async () => { const ok = await confirm({ title: 'Delete activity?', text: 'This will delete the activity and its data.' }); if (ok) deleteActivity(activity.id); }} leftIcon={<TrashIcon className="h-4 w-4" />}>Delete</Button>
                          <div className="inline-flex items-center space-x-2">
                            <Button size="sm" variant="secondary" onClick={() => { const full = `${window.location.origin}/#/standalone/fill/${activity.id}`; navigator.clipboard.writeText(full).then(() => swalToast('Link copied to clipboard', 'success')); }}>Copy Link</Button>
                            <Button size="sm" variant="secondary" onClick={() => { const full = `${window.location.origin}/#/standalone/fill/${activity.id}`; setShareUrl(full); setQrModalOpen(true); }}>QR Code</Button>
                            <Button size="sm" variant="secondary" onClick={() => { const full = `${window.location.origin}/#/standalone/fill/${activity.id}`; setShareUrl(full); setEmbedModalOpen(true); }}>Embed</Button>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* mobile overflow */}
                  <div className="sm:hidden relative">
                    <button onClick={() => setOpenActionsId(openActionsId === activity.id ? null : activity.id)} className="px-2 py-1 border rounded">⋯</button>
                    {openActionsId === activity.id && (
                      <div className="absolute right-0 mt-2 w-48 bg-white border rounded shadow p-2" style={{ zIndex: 9999 }}>
                        {canEdit && (
                          <>
                            <div className="text-sm"><button className="w-full text-left p-2" onClick={() => navigate(`/activities/build/${activity.id}`)}>Build/Edit Form</button></div>
                            <div className="text-sm"><button className="w-full text-left p-2" onClick={() => navigate(`/reports/builder?activityId=${activity.id}`)}>Build Report</button></div>
                            <div className="text-sm"><button className="w-full text-left p-2" onClick={() => navigate(`/activities/dashboard/${activity.id}`)}>View Data</button></div>
                            <div className="text-sm"><button className="w-full text-left p-2" onClick={() => { openModal(activity); setOpenActionsId(null); }}>Edit Activity</button></div>
                            <div className="text-sm"><button className="w-full text-left p-2 text-red-600" onClick={async () => { const ok = await confirm({ title: 'Delete activity?', text: 'This will delete the activity and its data.' }); if (ok) deleteActivity(activity.id); setOpenActionsId(null); }}>Delete</button></div>
                            <div className="border-t my-1"></div>
                          </>
                        )}
                        <div className="text-sm"><button className="w-full text-left p-2" onClick={() => { const full = `${window.location.origin}/#/standalone/fill/${activity.id}`; navigator.clipboard.writeText(full); setOpenActionsId(null); swalToast('Link copied to clipboard', 'success'); }}>Copy Link</button></div>
                        <div className="text-sm"><button className="w-full text-left p-2" onClick={() => { const full = `${window.location.origin}/#/standalone/fill/${activity.id}`; setShareUrl(full); setQrModalOpen(true); setOpenActionsId(null); }}>QR Code</button></div>
                        <div className="text-sm"><button className="w-full text-left p-2" onClick={() => { const full = `${window.location.origin}/#/standalone/fill/${activity.id}`; setShareUrl(full); setEmbedModalOpen(true); setOpenActionsId(null); }}>Embed</button></div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* QR Modal */}
      <Modal isOpen={qrModalOpen} onClose={() => setQrModalOpen(false)} title="QR Code">
        <div className="text-center">
          {shareUrl ? (
            <img src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(shareUrl)}`} alt="QR code" />
          ) : (
            <p>No URL</p>
          )}
          <div className="mt-4">
            <button onClick={() => { navigator.clipboard.writeText(shareUrl); swalToast('Link copied to clipboard', 'success'); }} className="px-3 py-2 bg-gray-100 rounded">Copy Link</button>
            <a className="ml-3 px-3 py-2 bg-blue-600 text-white rounded" href={shareUrl} target="_blank" rel="noreferrer">Open Link</a>
          </div>
        </div>
      </Modal>

      {/* Embed Modal */}
      <Modal isOpen={embedModalOpen} onClose={() => setEmbedModalOpen(false)} title="Embed Snippet">
        <div>
          <p className="text-sm text-gray-600">Copy the iframe snippet below and paste into your site. The snippet is shown as text and will not execute here.</p>
          <pre className="mt-3 p-3 bg-gray-100 rounded text-sm overflow-auto">{`<iframe src="${shareUrl}" width="800" height="900"></iframe>`}</pre>
            <div className="mt-3">
            <button onClick={() => { navigator.clipboard.writeText(`<iframe src="${shareUrl}" width="800" height="900"></iframe>`); swalToast('Embed snippet copied', 'success'); }} className="px-3 py-2 bg-gray-100 rounded">Copy Snippet</button>
            <a className="ml-3 px-3 py-2 bg-blue-600 text-white rounded" href={shareUrl} target="_blank" rel="noreferrer">Open Link</a>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={currentActivity.id ? "Edit Activity" : "New Activity"}
        footer={
          <>
            <Button onClick={handleSave} className="ml-3">Save</Button>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Program</label>
            <select className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={currentActivity.programId} onChange={(e) => setCurrentActivity({ ...currentActivity, programId: e.target.value })}>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Subtitle</label>
            <input type="text" className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={currentActivity.subtitle || ''} onChange={(e) => setCurrentActivity({ ...currentActivity, subtitle: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Title</label>
            <input type="text" className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={currentActivity.title || ''} onChange={(e) => setCurrentActivity({ ...currentActivity, title: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Details</label>
            <RichTextEditor value={currentActivity.details || ''} onChange={(html) => setCurrentActivity({ ...currentActivity, details: html })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Start Date</label>
              <input type="date" className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={currentActivity.startDate || ''} onChange={(e) => setCurrentActivity({ ...currentActivity, startDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">End Date</label>
              <input type="date" className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
                value={currentActivity.endDate || ''} onChange={(e) => setCurrentActivity({ ...currentActivity, endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Status</label>
            <select className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={currentActivity.status} onChange={(e) => setCurrentActivity({ ...currentActivity, status: e.target.value as any })}>
              <option value="Draft">Draft</option>
              <option value="Published">Published</option>
              <option value="Archived">Archived</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Response Type</label>
            <select className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm"
              value={(currentActivity as any).responseType || ''} onChange={(e) => setCurrentActivity({ ...currentActivity, responseType: e.target.value as any })}>
              <option value="Facility">Facility</option>
              <option value="User">User</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ActivitiesPage;