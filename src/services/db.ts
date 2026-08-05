import {
  seedConversations,
  seedFavorites,
  seedListings,
  seedMessages,
  seedUsers,
} from '@/data/seed';
import { keys, readJSON, writeJSON } from '@/services/storage';
import type { Conversation, Listing, Message, User } from '@/types';

/**
 * Base locale simulée. Toutes les lectures/écritures de l'app passent par ici,
 * ce qui permet de remplacer l'implémentation par un vrai backend (Supabase,
 * API REST…) sans toucher aux écrans.
 */

let ready: Promise<void> | null = null;

async function seedIfNeeded(): Promise<void> {
  const done = await readJSON<boolean>(keys.seeded, false);
  if (done) return;
  await Promise.all([
    writeJSON(keys.users, seedUsers),
    writeJSON(keys.listings, seedListings),
    writeJSON(keys.conversations, seedConversations),
    writeJSON(keys.messages, seedMessages),
    writeJSON(keys.favorites, seedFavorites),
  ]);
  await writeJSON(keys.seeded, true);
}

export function init(): Promise<void> {
  if (!ready) ready = seedIfNeeded();
  return ready;
}

/** Petite latence pour que les états de chargement soient réalistes. */
export const delay = (ms = 180) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function collection<T>(key: string, fallback: T[]): Promise<T[]> {
  await init();
  return readJSON<T[]>(key, fallback);
}

export const db = {
  users: () => collection<User>(keys.users, seedUsers),
  saveUsers: (users: User[]) => writeJSON(keys.users, users),

  listings: () => collection<Listing>(keys.listings, seedListings),
  saveListings: (listings: Listing[]) => writeJSON(keys.listings, listings),

  conversations: () => collection<Conversation>(keys.conversations, seedConversations),
  saveConversations: (items: Conversation[]) => writeJSON(keys.conversations, items),

  messages: () => collection<Message>(keys.messages, seedMessages),
  saveMessages: (items: Message[]) => writeJSON(keys.messages, items),

  favorites: async (): Promise<Record<string, string[]>> => {
    await init();
    return readJSON<Record<string, string[]>>(keys.favorites, seedFavorites);
  },
  saveFavorites: (favorites: Record<string, string[]>) => writeJSON(keys.favorites, favorites),
};

export const makeId = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
