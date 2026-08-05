import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = '@archersmarket/';

export async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJSON<T>(key: string, value: T): Promise<void> {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Le stockage local est un cache : un échec ne doit pas casser l'UI.
  }
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(PREFIX + key);
  } catch {
    // idem
  }
}

export const keys = {
  users: 'users',
  listings: 'listings',
  conversations: 'conversations',
  messages: 'messages',
  favorites: 'favorites',
  session: 'session',
  seeded: 'seeded-v1',
} as const;
