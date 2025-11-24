// Central list of application routes to populate permission dropdowns
export const appRoutes: { path: string; label?: string }[] = [
    { path: '/login', label: 'Login' },
    { path: '/dashboard', label: 'Dashboard' },
    { path: '/programs', label: 'Programs' },
    { path: '/activities/build/:activityId', label: 'Build Activity Form' },
    { path: '/activities/fill/:activityId', label: 'Fill Activity Form' },
    { path: '/standalone/fill/:activityId', label: 'Standalone Fill (embed)' },
    { path: '/activities/dashboard/:activityId', label: 'Activity Dashboard' },
    { path: '/activities/:activityId/followups', label: 'Question Followups' },
    { path: '/activities', label: 'Activities' },
    { path: '/reports', label: 'Reports' },
    { path: '/reports/builder', label: 'Report Builder' },
    { path: '/reports/:reportId', label: 'Report View' },
    { path: '/settings', label: 'Settings' },
    { path: '/docs', label: 'Docs' },
    { path: '/profile', label: 'Profile' },
    { path: '/users', label: 'Users' },
    { path: '/facilities', label: 'Facilities' },
];

export default appRoutes;
