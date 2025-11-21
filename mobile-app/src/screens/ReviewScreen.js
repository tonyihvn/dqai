import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Button, TextInput, Alert, StyleSheet } from 'react-native';
import { fetchAnswers, updateFollowup } from '../services/api';

export default function ReviewScreen({ route }) {
    const { activityId } = route.params;
    const [answers, setAnswers] = useState([]);
    const [editing, setEditing] = useState({});

    useEffect(() => {
        const load = async () => {
            const rows = await fetchAnswers(activityId);
            const list = [];
            for (const r of rows || []) {
                const ans = r.answers || [];
                if (Array.isArray(ans)) {
                    for (const a of ans) {
                        list.push({ reportId: r.id, ...a });
                    }
                }
            }
            setAnswers(list);
        };
        load();
    }, [activityId]);

    const handleSaveFollowup = async (answerId) => {
        try {
            await updateFollowup(answerId, editing[answerId] || '');
            Alert.alert('Saved', 'Follow-up saved');
        } catch (e) {
            Alert.alert('Error', e.message || 'Failed to save');
        }
    };

    return (
        <View style={{ flex: 1, padding: 12 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>Review Answers</Text>
            <FlatList
                data={answers}
                keyExtractor={(item, idx) => `${item.reportId}_${item.question_id || item.id || idx}`}
                renderItem={({ item }) => (
                    <View style={styles.item}>
                        <Text style={styles.q}>{item.question_id || item.questionId}</Text>
                        <Text style={styles.a}>Answer: {JSON.stringify(item.answer_value || item.answer)}</Text>
                        <Text>Reviewer: {item.reviewers_comment || '—'}</Text>
                        <TextInput
                            style={styles.input}
                            placeholder="Add quality improvement follow-up"
                            value={editing[item.id] || editing[item.question_id] || ''}
                            onChangeText={(t) => setEditing(prev => ({ ...prev, [item.id || item.question_id]: t }))}
                        />
                        <Button title="Save Follow-up" onPress={() => handleSaveFollowup(item.id || item.question_id)} />
                    </View>
                )}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    item: { padding: 10, borderWidth: 1, borderColor: '#eee', borderRadius: 6, marginBottom: 10 },
    q: { fontWeight: '700' },
    a: { marginBottom: 6 },
    input: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, marginVertical: 8 }
});
