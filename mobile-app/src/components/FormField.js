import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';

export default function FormField({ question, value, onChange }) {
    const label = question.questionText || question.question_text || question.text || question.id;
    return (
        <View style={styles.field}>
            <Text style={styles.label}>{label}</Text>
            <TextInput style={styles.input} value={String(value ?? '')} onChangeText={onChange} />
        </View>
    );
}

const styles = StyleSheet.create({
    field: { marginBottom: 10 },
    label: { fontWeight: '600', marginBottom: 6 },
    input: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }
});
