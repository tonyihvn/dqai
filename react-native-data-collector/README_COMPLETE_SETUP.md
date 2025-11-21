Quick setup (Expo)

1. Install Expo CLI if you don't have it:

```bash
npm install -g expo-cli
```

2. From the `react-native-data-collector` folder install dependencies:

```bash
npm install
```

3. Start the dev server:

```bash
npm start
```

4. Run on Android emulator (make sure emulator running):

```bash
npm run android
```

Notes:
- Update `src/services/api.js` `BASE_URL` to point to your backend (for Android emulator use `http://10.0.2.2:3000`).
- The app uses AsyncStorage for offline storage. Change to SQLite for more advanced use.
- Push notifications require `expo-notifications` and server support; implement separately.
