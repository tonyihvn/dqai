import React, { useState, useEffect } from 'react';
import { View, Text, Button, ScrollView, Alert } from 'react-native';
import { saveEntry, getEntry, deleteEntry } from '../services/storage';
import DynamicForm from '../components/DynamicForm';

export default function FormScreen({ route, navigation }) {
    const { form } = route.params;
    const [entry, setEntry] = useState(null);

    useEffect(() => {
        getEntry(form.id).then(setEntry);
    }, [form.id]);

    const handleSave = async (answers) => {
        await saveEntry(form.id, answers);
        Alert.alert('Saved', 'Entry saved locally.');
        navigation.goBack();
    };

    const handleDelete = async () => {
        await deleteEntry(form.id);
        Alert.alert('Deleted', 'Entry deleted.');
        navigation.goBack();
    };

    return (
        <ScrollView style={{ flex: 1, padding: 16 }}>
            <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>{form.title}</Text>
            <DynamicForm formDefinition={form.form_definition} initialValues={entry} onSubmit={handleSave} />
            {entry && <Button title="Delete Entry" color="red" onPress={handleDelete} />}
        </ScrollView>
    );
}
