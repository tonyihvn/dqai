import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import FillFormPage from './FillFormPage';

// Standalone form page: no sidebar, no nav, just the form
const StandaloneFormPage: React.FC = () => {
    // Pass activityId from URL params to FillFormPage
    const { activityId } = useParams<{ activityId: string }>();
    // Optionally, you could pass a prop to FillFormPage to hide nav/sidebar if needed
    return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="w-full max-w-3xl mx-auto p-4">
                <FillFormPage activityIdOverride={activityId} standaloneMode />
            </div>
        </div>
    );
};

export default StandaloneFormPage;
