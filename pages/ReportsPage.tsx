
import React, { useState } from 'react';
import Card from '../components/ui/Card';
import { useMockData } from '../hooks/useMockData';
import Modal from '../components/ui/Modal';
import Button from '../components/ui/Button';
import { DocumentMagnifyingGlassIcon, EyeIcon } from '@heroicons/react/24/outline';
import { ActivityReport, UploadedFile } from '../types';
import { useNavigate } from 'react-router-dom';
import ConversationPanel from '../components/ui/ConversationPanel';

const ReportsPage: React.FC = () => {
  const { reports, activities, users, getFormDefinition } = useMockData();
  const navigate = useNavigate();

  const getActivityTitle = (id: string) => activities.find(a => a.id === id)?.title || id;
  const getUserName = (id?: string) => {
    const u = users.find(u => u.id === id);
    return u ? `${u.firstName} ${u.lastName}` : 'N/A';
  }

  const getQuestionText = (activityId: string, qId: string) => {
    const form = getFormDefinition(activityId);
    if (!form) return qId;
    for (const p of form.pages) {
      for (const s of p.sections) {
        for (const q of s.questions) {
          if (q.id === qId) return q.questionText;
        }
      }
    }
    return qId;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Submitted Reports</h1>

      <div className="grid gap-6 mb-8 md:grid-cols-3">
        <Card className="bg-blue-50 border-blue-100">
          <div className="text-center">
            <span className="block text-3xl font-bold text-blue-600">{reports.length}</span>
            <span className="text-sm text-blue-600">Total Submissions</span>
          </div>
        </Card>
      </div>

      <Card>
        {reports.length === 0 ? (
          <div className="text-center py-12">
            <DocumentMagnifyingGlassIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No reports</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by filling out an activity form.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Submitted By</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Files</th>
                <th className="relative px-6 py-3"><span className="sr-only">View</span></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {reports.map((report) => (
                <tr key={report.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{getActivityTitle(report.activityId)}</div>
                    <div className="text-xs text-gray-500">{report.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getUserName(report.userId)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{new Date(report.submissionDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{report.uploadedFiles?.length || 0} Files</td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex flex-col gap-1 items-end">
                    <button className="text-primary-600 hover:text-primary-900 flex items-center" onClick={() => navigate(`/reports/${report.id}`)}>
                      <EyeIcon className="h-5 w-5 mr-1" /> View
                    </button>
                    <button className="text-blue-600 hover:text-blue-900 flex items-center text-xs" onClick={() => {
                      // Find activity to get responseType
                      const activity = activities.find(a => a.id === report.activityId);
                      if (!activity) return;
                      // If Facility level, go to fill form for that activity/facility
                      // Note: route is /activities/fill/:activityId
                      const base = `/activities/fill/${report.activityId}`;
                      const params = new URLSearchParams();
                      params.set('reportId', String(report.id));
                      if ((activity.responseType || '').toLowerCase() === 'facility') {
                        params.set('facilityId', String(report.facilityId || ''));
                      } else if ((activity.responseType || '').toLowerCase() === 'user') {
                        params.set('userId', String(report.userId || ''));
                      }
                      navigate(`${base}?${params.toString()}`);
                    }}>Edit Report Form</button>
                    <button className="text-red-600 hover:text-red-900 flex items-center text-xs" onClick={() => alert('Delete Report coming soon')}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="mt-6">
        <ConversationPanel context={{ reports }} scope="reports" />
      </div>

    </div >
  );
};

export default ReportsPage;
