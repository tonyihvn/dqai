import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from './api';

export async function login(email, password) {
    const data = await api.login(email, password);
    // Expect server to return { user: {...}, token: '...' }
    if (data.token) await AsyncStorage.setItem('token', data.token);
    if (data.user) await AsyncStorage.setItem('user', JSON.stringify(data.user));
    return data.user || data;
}

export async function logout() {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
}

export async function getUser() {
    const u = await AsyncStorage.getItem('user');
    return u ? JSON.parse(u) : null;
}

export default { login, logout, getUser };
