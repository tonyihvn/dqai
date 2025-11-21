
import React, { useState } from 'react';
import Card from '../components/ui/Card';
import { useMockData } from '../hooks/useMockData';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { PlusIcon, PencilIcon, TrashIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { Program } from '../types';
import { useNavigate } from 'react-router-dom';

const ProgramsPage: React.FC = () => {
    const { programs, saveProgram, deleteProgram, currentUser } = useMockData();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentProgram, setCurrentProgram] = useState<Partial<Program>>({});

    const canEdit = currentUser?.role === 'Admin';

    const openModal = (program?: Program) => {
        setCurrentProgram(program || { name: '', details: '', type: '', category: '' });
        setIsModalOpen(true);
    };
    const navigate = useNavigate();

    const handleSave = () => {
        if (currentProgram.name && currentProgram.type) {
            saveProgram(currentProgram as Program);
            setIsModalOpen(false);
        } else {
            alert("Name and Type are required.");
        }
    };

    return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Programs</h1>
        {canEdit && <Button onClick={() => openModal()} leftIcon={<PlusIcon className="h-5 w-5"/>}>New Program</Button>}
      </div>
      <Card>
        <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {programs.map((program) => (
                <tr key={program.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{program.name}</div>
                    <div className="text-sm text-gray-500">{program.details}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{program.category}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{program.type}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <button onClick={() => navigate(`/activities?programId=${program.id}`)} className="text-sm text-blue-600 hover:underline inline-flex items-center"><DocumentTextIcon className="h-4 w-4 mr-1" /> View Activities</button>
                      {canEdit && (
                        <>
                          <button onClick={() => openModal(program)} className="text-indigo-600 hover:text-indigo-900 ml-2"><PencilIcon className="h-5 w-5"/></button>
                          <button onClick={() => { if(confirm('Delete program?')) deleteProgram(program.id) }} className="text-red-600 hover:text-red-900 ml-2"><TrashIcon className="h-5 w-5"/></button>
                        </>
                      )}
                    </td>
                </tr>
              ))}
            </tbody>
          </table>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={currentProgram.id ? "Edit Program" : "New Program"}
        footer={
            <>
                <Button onClick={handleSave} className="ml-3">Save</Button>
                <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
            </>
        }
      >
          <div className="space-y-4">
              <div>
                  <label className="block text-sm font-medium text-gray-700">Program Name</label>
                  <input type="text" className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm" 
                        value={currentProgram.name || ''} onChange={(e) => setCurrentProgram({...currentProgram, name: e.target.value})} />
              </div>
              <div>
                  <label className="block text-sm font-medium text-gray-700">Details</label>
                  <textarea className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm" 
                        value={currentProgram.details || ''} onChange={(e) => setCurrentProgram({...currentProgram, details: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">Category</label>
                    <input type="text" className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm" 
                            value={currentProgram.category || ''} onChange={(e) => setCurrentProgram({...currentProgram, category: e.target.value})} />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">Type</label>
                    <input type="text" className="mt-1 block w-full border-gray-300 rounded-md shadow-sm focus:ring-primary-500 focus:border-primary-500 sm:text-sm" 
                            value={currentProgram.type || ''} onChange={(e) => setCurrentProgram({...currentProgram, type: e.target.value})} />
                </div>
              </div>
          </div>
      </Modal>
    </div>
  );
};

export default ProgramsPage;
