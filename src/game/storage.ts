import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_CONFIG } from './engine';
import { Difficulty, GameMode, StoredSession, StoredSettings } from './types';

export const SETTINGS_KEY = 'mentalCalc.settings.v1';
export const SESSIONS_KEY = 'mentalCalc.sessions.v1';

const DIFFICULTIES = new Set<Difficulty>(['easy', 'medium', 'hard']);
const MODES = new Set<GameMode>(['classic', 'trueFalse', 'multipleChoice', 'timeAttack']);

function sanitizeSettings(value: Partial<StoredSettings> | null | undefined): StoredSettings {
  const questionCount = Number(value?.questionCount);

  return {
    difficulty: DIFFICULTIES.has(value?.difficulty as Difficulty)
      ? (value?.difficulty as Difficulty)
      : DEFAULT_CONFIG.difficulty,
    mode: MODES.has(value?.mode as GameMode) ? (value?.mode as GameMode) : DEFAULT_CONFIG.mode,
    questionCount: Number.isFinite(questionCount)
      ? Math.min(25, Math.max(5, Math.round(questionCount)))
      : DEFAULT_CONFIG.questionCount,
    dynamicDifficulty:
      typeof value?.dynamicDifficulty === 'boolean'
        ? value.dynamicDifficulty
        : DEFAULT_CONFIG.dynamicDifficulty,
    soundEnabled:
      typeof value?.soundEnabled === 'boolean'
        ? value.soundEnabled
        : DEFAULT_CONFIG.soundEnabled,
  };
}

function isStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== 'object') return false;

  const session = value as StoredSession;
  return (
    typeof session.id === 'string' &&
    typeof session.dateIso === 'string' &&
    typeof session.result?.score === 'number' &&
    typeof session.result?.accuracy === 'number' &&
    typeof session.result?.totalQuestions === 'number' &&
    Array.isArray(session.records)
  );
}

function sanitizeSession(session: StoredSession): StoredSession {
  return {
    ...session,
    config: sanitizeSettings(session.config),
  };
}

export async function loadSettings(): Promise<StoredSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? sanitizeSettings(JSON.parse(raw)) : DEFAULT_CONFIG;
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
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(isStoredSession).map(sanitizeSession).slice(0, 50) : [];
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
