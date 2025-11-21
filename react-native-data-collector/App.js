import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import FormScreen from './src/screens/FormScreen';
import SyncScreen from './src/screens/SyncScreen';
import NotificationScreen from './src/screens/NotificationScreen';
import ReviewScreen from './src/screens/ReviewScreen';

const Stack = createStackNavigator();

const App = () => {
    return (
        <NavigationContainer>
            <Stack.Navigator initialRouteName="Login">
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Home" component={HomeScreen} />
                <Stack.Screen name="Form" component={FormScreen} />
                <Stack.Screen name="Review" component={ReviewScreen} />
                <Stack.Screen name="Sync" component={SyncScreen} />
                <Stack.Screen name="Notifications" component={NotificationScreen} />
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default App;
