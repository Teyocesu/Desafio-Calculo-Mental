import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_CONFIG } from './engine';
import { StoredSession, StoredSettings } from './types';

export const SETTINGS_KEY = 'mentalCalc.settings.v1';
export const SESSIONS_KEY = 'mentalCalc.sessions.v1';

export async function loadSettings(): Promise<StoredSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveSettings(settings: StoredSettings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export async function loadSessions(): Promise<StoredSession[]> {
  try {
    const raw = await AsyncStorage.getItem(SESSIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export async function saveSession(session: StoredSession) {
  const sessions = await loadSessions();
  const nextSessions = [session, ...sessions].slice(0, 50);
  await AsyncStorage.setItem(SESSIONS_KEY, JSON.stringify(nextSessions));
  return nextSessions;
}

export async function clearSessions() {
  await AsyncStorage.removeItem(SESSIONS_KEY);
}
