import { db } from '@/services/db';

export async function fetchFavorites(userId: string): Promise<string[]> {
  const all = await db.favorites();
  return all[userId] ?? [];
}

export async function toggleFavorite(userId: string, listingId: string): Promise<string[]> {
  const all = await db.favorites();
  const current = all[userId] ?? [];
  const next = current.includes(listingId)
    ? current.filter((id) => id !== listingId)
    : [listingId, ...current];
  await db.saveFavorites({ ...all, [userId]: next });
  return next;
}
