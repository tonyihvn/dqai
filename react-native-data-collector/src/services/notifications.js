// Lightweight notifications helper: fetches server notifications and (optionally) triggers a local notification
import * as api from './api';
import * as Notifications from 'expo-notifications';
import * as Permissions from 'expo-permissions';
import AsyncStorage from '@react-native-async-storage/async-storage';

export async function registerForPushNotificationsAsync() {
    try {
        const settings = await Notifications.getPermissionsAsync();
        if (!settings.granted) {
            const { status } = await Notifications.requestPermissionsAsync();
            if (status !== 'granted') return null;
        }
        const token = (await Notifications.getExpoPushTokenAsync()).data;
        await AsyncStorage.setItem('pushToken', token);
        return token;
    } catch (e) {
        return null;
    }
}

export async function fetchAndSaveNotifications() {
    const userRaw = await AsyncStorage.getItem('user');
    const user = userRaw ? JSON.parse(userRaw) : null;
    if (!user) return [];
    const notifs = await api.getNotifications(user.id, user.facility_id);
    // Optionally schedule a local display for each unread notification
    for (const n of notifs || []) {
        await Notifications.scheduleNotificationAsync({ content: { title: n.title, body: n.body }, trigger: null });
    }
    return notifs;
}

export default { registerForPushNotificationsAsync, fetchAndSaveNotifications };
