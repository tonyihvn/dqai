import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet } from 'react-native';
import { Picker } from '@react-native-picker/picker';

// Simple dynamic form renderer. Expects formDefinition with pages->sections->questions
export default function DynamicForm({ formDefinition = {}, initialValues = null, onSubmit }) {
    const questions = [];
    for (const page of formDefinition.pages || []) {
        for (const section of page.sections || []) {
            for (const q of section.questions || []) {
                questions.push(q);
            }
        }
    }

    const initial = {};
    (initialValues && initialValues.answers) ? Object.assign(initial, initialValues.answers) : null;
    const [values, setValues] = useState(initial);

    const setVal = (id, v) => setValues(prev => ({ ...prev, [id]: v }));

    return (
        <View>
            {questions.map((q) => (
                <View key={q.id} style={styles.field}>
                    <Text style={styles.label}>{q.questionText || q.question_text || q.text}</Text>
                    {q.answerType === 'select' || q.answer_type === 'select' ? (
                        <Picker selectedValue={values[q.id] ?? ''} onValueChange={(v) => setVal(q.id, v)}>
                            {(q.options || []).map(opt => (
                                <Picker.Item key={String(opt.value)} label={opt.label} value={opt.value} />
                            ))}
                        </Picker>
                    ) : q.answerType === 'textarea' || q.answer_type === 'textarea' ? (
                        <TextInput style={styles.textarea} multiline value={values[q.id] ?? ''} onChangeText={(t) => setVal(q.id, t)} />
                    ) : (
                        <TextInput style={styles.input} value={String(values[q.id] ?? '')} onChangeText={(t) => setVal(q.id, t)} />
                    )}
                </View>
            ))}
            <Button title="Save Entry" onPress={() => onSubmit(values)} />
        </View>
    );
}

const styles = StyleSheet.create({
    field: { marginBottom: 12 },
    label: { fontWeight: 'bold', marginBottom: 4 },
    input: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 },
    textarea: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, height: 120 }
});
