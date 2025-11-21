import React, { useState, useEffect } from 'react';
import { View, Text, Button, FlatList, StyleSheet, Alert } from 'react-native';
import { getUnsyncedEntries, syncEntries } from '../services/sync';

export default function SyncScreen() {
    const [entries, setEntries] = useState([]);
    const [syncing, setSyncing] = useState(false);

    useEffect(() => {
        getUnsyncedEntries().then(setEntries);
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        const result = await syncEntries();
        Alert.alert('Sync Complete', `${result.synced} entries synced, ${result.failed} failed.`);
        setSyncing(false);
        getUnsyncedEntries().then(setEntries);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Unsynced Entries</Text>
            <FlatList
                data={entries}
                keyExtractor={item => item.id.toString()}
                renderItem={({ item }) => (
                    <View style={styles.entryItem}>
                        <Text>Form: {item.formTitle}</Text>
                        <Text>Status: {item.status}</Text>
                    </View>
                )}
            />
            <Button title={syncing ? 'Syncing...' : 'Sync Now'} onPress={handleSync} disabled={syncing} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, padding: 16 },
    title: { fontSize: 22, fontWeight: 'bold', marginBottom: 16 },
    entryItem: { padding: 12, borderWidth: 1, borderColor: '#eee', borderRadius: 8, marginBottom: 10 },
});
