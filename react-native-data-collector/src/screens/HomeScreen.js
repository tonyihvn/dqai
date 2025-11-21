import React, { useEffect, useState } from 'react';
import { View, Text, Button, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { getFormsForFacility } from '../services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import storage from '../services/storage';

export default function HomeScreen({ navigation }) {
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchForms = async () => {
            setLoading(true);
            const user = JSON.parse(await AsyncStorage.getItem('user'));
            let forms = [];
            try {
                forms = await getFormsForFacility(user.facility_id);
                if (forms && forms.length) {
                    await storage.saveForms(forms);
                }
            } catch (e) {
                // ignore, fallback to local
            }
            if (!forms || !forms.length) {
                forms = await storage.getForms();
            }
            setForms(forms);
            setLoading(false);
        };
        fetchForms();
    }, []);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Available Forms</Text>
            {loading ? <Text>Loading...</Text> : (
                <FlatList
                    data={forms}
                    keyExtractor={item => item.id.toString()}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.formItem} onPress={() => navigation.navigate('Form', { form: item })}>
                            <Text style={styles.formTitle}>{item.title}</Text>
                            <Text>{item.details}</Text>
                        </TouchableOpacity>
                    )}
                />
            )}
            <Button title="Sync" onPress={() => navigation.navigate('Sync')} />
            <Button title="Notifications" onPress={() => navigation.navigate('Notifications')} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16 },
    title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
    formItem: { padding: 16, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 12 },
    formTitle: { fontWeight: 'bold', fontSize: 16 },
});
