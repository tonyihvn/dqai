import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Base URL: Edit this to point at your backend. For Android emulator use 10.0.2.2:3000
export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function getClient() {
    const token = await AsyncStorage.getItem('token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    return axios.create({ baseURL: BASE_URL, timeout: 20000, headers });
}

export async function login(email, password) {
    const client = await getClient();
    const r = await client.post('/api/auth/login', { email, password });
    return r.data;
}

export async function getFormsForFacility(facilityId) {
    const client = await getClient();
    try {
        const r = await client.get(`/api/facilities/${facilityId}/forms`);
        return r.data;
    } catch (e) {
        try {
            const r2 = await client.get(`/api/activities?facilityId=${facilityId}`);
            return r2.data;
        } catch (e2) {
            return [];
        }
    }
}

export async function getNotifications(userId, facilityId) {
    const client = await getClient();
    try {
        const r = await client.get('/api/notifications', { params: { userId, facilityId } });
        return r.data || [];
    } catch (e) { return []; }
}

export async function postSubmission(activityId, payload) {
    const client = await getClient();
    const r = await client.post(`/api/activity/${activityId}/submissions`, payload);
    return r.data;
}

export async function fetchAnswers(activityId) {
    const client = await getClient();
    const r = await client.get(`/api/activity/${activityId}/submissions`);
    return r.data;
}

export async function updateFollowup(answerId, followup) {
    const client = await getClient();
    const r = await client.patch(`/api/answers/${answerId}/followup`, { quality_improvement_followup: followup });
    return r.data;
}
