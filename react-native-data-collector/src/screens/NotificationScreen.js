import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { getNotifications } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function NotificationScreen() {
    const [notifications, setNotifications] = useState([]);

    useEffect(() => {
        const fetchNotifications = async () => {
            const user = JSON.parse(await AsyncStorage.getItem('user'));
            const notifs = await getNotifications(user.id, user.facility_id);
            setNotifications(notifs);
        };
        fetchNotifications();
    }, []);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Notifications</Text>
            <FlatList
                data={notifications}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => (
                    <View style={styles.notifItem}>
                        <Text style={styles.notifTitle}>{item.title}</Text>
                        <Text>{item.body}</Text>
                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16 },
    title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
    notifItem: { padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 10 },
    notifTitle: { fontWeight: 'bold', fontSize: 16 },
});
