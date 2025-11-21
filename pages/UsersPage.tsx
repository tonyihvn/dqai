
import React, { useState, useEffect } from 'react';
import Card from '../components/ui/Card';
import { useMockData } from '../hooks/useMockData';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import MInput from '../components/ui/MInput';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { User } from '../types';

const UsersPage: React.FC = () => {
  const { users, saveUser, deleteUser, currentUser, facilities } = useMockData();
  const [allRoles, setAllRoles] = useState<{ id: number, name: string }[]>([]);
  const [allPermissions, setAllPermissions] = useState<{ id: number, name: string }[]>([]);
  useEffect(() => {
    // Fetch roles and permissions from backend
    fetch('/api/admin/roles', { credentials: 'include' })
      .then(async (r) => { if (!r.ok) { setAllRoles([]); return; } const j = await r.json(); setAllRoles(Array.isArray(j) ? j : []); })
      .catch(() => setAllRoles([]));
    fetch('/api/admin/permissions', { credentials: 'include' })
      .then(async (r) => { if (!r.ok) { setAllPermissions([]); return; } const j = await r.json(); setAllPermissions(Array.isArray(j) ? j : []); })
      .catch(() => setAllPermissions([]));
  }, []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentUserEdit, setCurrentUserEdit] = useState<Partial<User>>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const canEdit = currentUser?.role === 'Admin';

  const openModal = (u?: User) => {
    setAvatarFile(null);
    setAvatarPreview(u?.profileImage || null);
    setCurrentUserEdit({
      ...u,
      assignedRoles: u?.assignedRoles || [],
      assignedPermissions: u?.assignedPermissions || [],
    } as any || { firstName: '', lastName: '', email: '', role: 'Data Collector', status: 'Active', password: '', facilityId: undefined, assignedRoles: [], assignedPermissions: [] });
    setIsModalOpen(true);
  };

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });

  const handleSave = async () => {
    if (!currentUserEdit.firstName || !currentUserEdit.email) {
      alert('Name and Email are required.');
      return;
    }

    const toSave = { ...currentUserEdit } as Partial<User>;
    if (avatarFile) {
      try {
        const dataUrl = await readFileAsDataUrl(avatarFile);
        toSave.profileImage = dataUrl;
      } catch (e) {
        console.error('Failed to read avatar file', e);
      }
    } else if (avatarPreview) {
      // if preview exists but no new file, keep existing
      toSave.profileImage = avatarPreview;
    }

    // Save roles/permissions assignments
    const { assignedRoles, assignedPermissions, ...userData } = toSave as any;
    saveUser(userData as User);
    // Assign roles
    if (assignedRoles && assignedRoles.length > 0) {
      fetch('/api/admin/roles/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: userData.id, roleIds: assignedRoles })
      });
    }
    // Assign permissions
    if (assignedPermissions && assignedPermissions.length > 0) {
      fetch('/api/admin/permissions/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ userId: userData.id, permissionIds: assignedPermissions })
      });
    }
    setIsModalOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-800">Users</h1>
        {canEdit && <Button onClick={() => openModal()} leftIcon={<PlusIcon className="h-5 w-5" />}>New User</Button>}
      </div>
      <Card>
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              {canEdit && <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id}>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 h-10 w-10">
                      {user.profileImage ? (
                        <img className="h-10 w-10 rounded-full object-cover" src={user.profileImage} alt="avatar" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center text-xs text-gray-400">No</div>
                      )}
                    </div>
                    <div className="ml-3">
                      <div className="text-sm font-medium text-gray-900">{user.firstName} {user.lastName}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.role}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {user.status === 'Active' && (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">Active</span>
                  )}
                  {user.status === 'Inactive' && (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">Inactive</span>
                  )}
                  {user.status === 'Suspended' && (
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-amber-100 text-amber-800">Suspended</span>
                  )}
                </td>
                {canEdit && (
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                    <button onClick={() => openModal(user)} className="text-indigo-600 hover:text-indigo-900"><PencilIcon className="h-5 w-5" /></button>
                    <button onClick={() => { if (confirm('Delete user?')) deleteUser(user.id) }} className="text-red-600 hover:text-red-900"><TrashIcon className="h-5 w-5" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={currentUserEdit.id ? "Edit User" : "New User"}
        footer={
          <>
            <Button onClick={handleSave} className="ml-3">Save</Button>
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Cancel</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <MInput label="First Name" type="text" value={currentUserEdit.firstName || ''} onChange={v => setCurrentUserEdit({ ...currentUserEdit, firstName: v })} />
            <MInput label="Last Name" type="text" value={currentUserEdit.lastName || ''} onChange={v => setCurrentUserEdit({ ...currentUserEdit, lastName: v })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Profile Image</label>
            {avatarPreview && (
              <div className="mb-2">
                <img src={avatarPreview} alt="avatar-preview" className="h-16 w-16 rounded-full object-cover" />
              </div>
            )}
            <MInput label="Upload Image" type="file" onChange={(files: FileList | string) => {
              // MInput returns FileList for file inputs
              if (files && typeof files !== 'string' && (files as FileList).length > 0) {
                const f = (files as FileList)[0];
                setAvatarFile(f);
                const reader = new FileReader();
                reader.onload = () => setAvatarPreview(String(reader.result));
                reader.readAsDataURL(f);
              } else {
                setAvatarFile(null);
                setAvatarPreview(null);
              }
            }} />
          </div>
          <div>
            <MInput label="Email" type="email" value={currentUserEdit.email || ''} onChange={v => setCurrentUserEdit({ ...currentUserEdit, email: v })} />
          </div>
          <div>
            <MInput label="Phone" type="text" value={currentUserEdit.phoneNumber || ''} onChange={v => setCurrentUserEdit({ ...currentUserEdit, phoneNumber: v })} />
          </div>
          <div>
            <MInput label="Password" type="password" value={currentUserEdit.password || ''} onChange={v => setCurrentUserEdit({ ...currentUserEdit, password: v })} />
          </div>
          <div>
            <MInput label="Role" type="select" value={currentUserEdit.role} onChange={v => setCurrentUserEdit({ ...currentUserEdit, role: v })}
              options={[{ value: 'Admin', label: 'Admin' }, { value: 'Form Builder', label: 'Form Builder' }, { value: 'Data Collector', label: 'Data Collector' }, { value: 'Viewer', label: 'Viewer' }, { value: 'Responder', label: 'Responder' }]} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign Roles</label>
            <div className="flex flex-wrap gap-2">
              {allRoles.map(r => (
                <label key={r.id} className="inline-flex items-center text-xs">
                  <input type="checkbox" checked={currentUserEdit.assignedRoles?.includes(r.id)}
                    onChange={e => {
                      const checked = e.target.checked;
                      setCurrentUserEdit((prev: any) => ({
                        ...prev,
                        assignedRoles: checked
                          ? [...(prev.assignedRoles || []), r.id]
                          : (prev.assignedRoles || []).filter((id: number) => id !== r.id)
                      }));
                    }}
                  />
                  <span className="ml-1">{r.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Assign Permissions</label>
            <div className="flex flex-wrap gap-2">
              {allPermissions.map(p => (
                <label key={p.id} className="inline-flex items-center text-xs">
                  <input type="checkbox" checked={currentUserEdit.assignedPermissions?.includes(p.id)}
                    onChange={e => {
                      const checked = e.target.checked;
                      setCurrentUserEdit((prev: any) => ({
                        ...prev,
                        assignedPermissions: checked
                          ? [...(prev.assignedPermissions || []), p.id]
                          : (prev.assignedPermissions || []).filter((id: number) => id !== p.id)
                      }));
                    }}
                  />
                  <span className="ml-1">{p.name}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <MInput label="Facility (optional)" type="select" value={currentUserEdit.facilityId || ''} onChange={v => setCurrentUserEdit({ ...currentUserEdit, facilityId: v ? Number(v) : undefined })}
              options={[{ value: '', label: 'None' }, ...(facilities.map(f => ({ value: f.id, label: f.name })))]} />
          </div>
          <div>
            <MInput label="Status" type="select" value={currentUserEdit.status} onChange={v => setCurrentUserEdit({ ...currentUserEdit, status: v })}
              options={[{ value: 'Active', label: 'Active' }, { value: 'Inactive', label: 'Inactive' }, { value: 'Suspended', label: 'Suspended' }]} />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default UsersPage;
