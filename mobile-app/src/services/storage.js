import AsyncStorage from '@react-native-async-storage/async-storage';

const FORMS_KEY = 'rn_forms';
const ENTRIES_KEY = 'rn_entries';

export async function saveForms(forms) {
    await AsyncStorage.setItem(FORMS_KEY, JSON.stringify(forms || []));
}
export async function getForms() {
    const v = await AsyncStorage.getItem(FORMS_KEY);
    return v ? JSON.parse(v) : [];
}

export async function saveEntry(formId, answers) {
    const all = await getAllEntries();
    const userRaw = await AsyncStorage.getItem('user');
    const user = userRaw ? JSON.parse(userRaw) : null;
    const entry = { id: `${formId}_${Date.now()}`, formId, activityId: formId, formTitle: '', answers, status: 'pending', createdAt: Date.now(), userId: user?.id || null, facilityId: user?.facility_id || null };
    all.push(entry);
    await AsyncStorage.setItem(ENTRIES_KEY, JSON.stringify(all));
}

export async function getEntry(formId) {
    const all = await getAllEntries();
    return all.find(e => e.formId === formId) || null;
}

export async function deleteEntry(formId) {
    let all = await getAllEntries();
    all = all.filter(e => e.formId !== formId);
    await AsyncStorage.setItem(ENTRIES_KEY, JSON.stringify(all));
}

export async function getAllEntries() {
    const v = await AsyncStorage.getItem(ENTRIES_KEY);
    return v ? JSON.parse(v) : [];
}

export async function getUnsyncedEntries() {
    const all = await getAllEntries();
    return all.filter(e => e.status !== 'synced');
}

export async function markEntrySynced(entryId) {
    let all = await getAllEntries();
    all = all.map(e => e.id === entryId ? { ...e, status: 'synced', syncedAt: Date.now() } : e);
    await AsyncStorage.setItem(ENTRIES_KEY, JSON.stringify(all));
}

export default { saveForms, getForms, saveEntry, getEntry, deleteEntry, getAllEntries, getUnsyncedEntries, markEntrySynced };
