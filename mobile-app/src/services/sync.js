import NetInfo from '@react-native-community/netinfo';
import storage from './storage';
import { postSubmission } from './api';

export async function getUnsyncedEntries() {
    return storage.getUnsyncedEntries();
}

export async function syncEntries() {
    const entries = await storage.getUnsyncedEntries();
    let synced = 0;
    let failed = 0;
    const state = await NetInfo.fetch();
    if (!state.isConnected) return { synced: 0, failed: entries.length };

    for (const e of entries) {
        try {
            // payload assumed to match server's expected shape. adjust as needed
            await postSubmission(e.activityId || e.formId, { answers: e.answers, userId: e.userId || null, facilityId: e.facilityId || null });
            await storage.markEntrySynced(e.id);
            synced++;
        } catch (err) {
            failed++;
        }
    }
    return { synced, failed };
}

export default { getUnsyncedEntries, syncEntries };
