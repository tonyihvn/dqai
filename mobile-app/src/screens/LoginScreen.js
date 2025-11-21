import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert } from 'react-native';
import auth from '../services/auth';

export default function LoginScreen({ navigation }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        setLoading(true);
        try {
            const user = await auth.login(email, password);
            if (!user) throw new Error('Invalid login response');
            navigation.replace('Home');
        } catch (e) {
            Alert.alert('Login Failed', e.message || 'Invalid credentials');
        }
        setLoading(false);
    };

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Data Collector Login</Text>
            <TextInput style={styles.input} placeholder="Email" value={email} onChangeText={setEmail} autoCapitalize="none" />
            <TextInput style={styles.input} placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
            <Button title={loading ? 'Logging in...' : 'Login'} onPress={handleLogin} disabled={loading} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, justifyContent: 'center', padding: 24 },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 24, textAlign: 'center' },
    input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 12, marginBottom: 16 },
});
