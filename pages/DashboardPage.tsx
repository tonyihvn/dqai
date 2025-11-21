
import React from 'react';
import { useMockData } from '../hooks/useMockData';
import Card from '../components/ui/Card';
import { FolderIcon, ClipboardDocumentListIcon, BuildingOfficeIcon, UserGroupIcon } from '@heroicons/react/24/outline';

import { useNavigate } from 'react-router-dom';
const StatCard = ({ title, value, icon, to }: { title: string; value: number; icon: React.ReactNode; to: string }) => {
  const navigate = useNavigate();
  return (
    <Card className="cursor-pointer hover:shadow-lg transition" onClick={() => navigate(to)}>
      <div className="flex items-center">
        <div className="p-3 rounded-md bg-primary-500 text-white">
          {icon}
        </div>
        <div className="ml-4">
          <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </Card>
  );
};


const DashboardPage: React.FC = () => {
  const { programs, activities, facilities, users } = useMockData();

  const activityStatusData = activities.reduce((acc, activity) => {
    const status = activity.status;
    const existing = acc.find(item => item.name === status);
    if (existing) {
      existing.count += 1;
    } else {
      acc.push({ name: status, count: 1 });
    }
    return acc;
  }, [] as { name: string; count: number }[]);


  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Total Programs" value={programs.length} icon={<FolderIcon className="h-6 w-6" />} to="/programs" />
        <StatCard title="Total Activities" value={activities.length} icon={<ClipboardDocumentListIcon className="h-6 w-6" />} to="/activities" />
        <StatCard title="Total Facilities" value={facilities.length} icon={<BuildingOfficeIcon className="h-6 w-6" />} to="/facilities" />
        <StatCard title="Total Users" value={users.length} icon={<UserGroupIcon className="h-6 w-6" />} to="/users" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Activities by Status">
          <div className="space-y-3 p-4">
            {activityStatusData.length === 0 && <p className="text-sm text-gray-500">No activity data.</p>}
            {activityStatusData.length > 0 && (() => {
              const max = Math.max(...activityStatusData.map(d => d.count));
              return (
                <div className="space-y-2">
                  {activityStatusData.map(d => (
                    <div key={d.name} className="flex items-center space-x-3">
                      <div className="w-28 text-sm text-gray-700">{d.name}</div>
                      <div className="flex-1 bg-gray-100 h-4 rounded overflow-hidden">
                        <div className="h-4 bg-primary-500" style={{ width: `${Math.round((d.count / (max || 1)) * 100)}%` }} />
                      </div>
                      <div className="w-10 text-right text-sm text-gray-700">{d.count}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </Card>
        <Card title="Recent Activities">
          <ul className="divide-y divide-gray-200">
            {activities.slice(0, 5).map(activity => (
              <li key={activity.id} className="py-3">
                <div className="flex justify-between">
                  <p className="text-sm font-medium text-gray-800">{activity.title}</p>
                  <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${activity.status === 'Published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                    {activity.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500">{activity.details && activity.details.replace(/<[^>]+>/g, '')}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

    </div>
  );
};

export default DashboardPage;
