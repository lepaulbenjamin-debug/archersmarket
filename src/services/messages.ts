import { db, delay, makeId } from '@/services/db';
import type { Conversation, Message } from '@/types';

export async function fetchThreads(): Promise<{
  conversations: Conversation[];
  messages: Message[];
}> {
  await delay(140);
  const [conversations, messages] = await Promise.all([db.conversations(), db.messages()]);
  return { conversations, messages };
}

/** Retourne la conversation existante pour ce couple annonce/acheteur, ou la crée. */
export async function openConversation(
  listingId: string,
  buyerId: string,
  sellerId: string,
): Promise<Conversation> {
  const conversations = await db.conversations();
  const existing = conversations.find(
    (c) => c.listingId === listingId && c.buyerId === buyerId && c.sellerId === sellerId,
  );
  if (existing) return existing;

  const conversation: Conversation = {
    id: makeId('c'),
    listingId,
    buyerId,
    sellerId,
    updatedAt: new Date().toISOString(),
    readBy: [buyerId],
  };
  await db.saveConversations([conversation, ...conversations]);
  return conversation;
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  text: string,
  offer?: number,
): Promise<{ conversations: Conversation[]; messages: Message[] }> {
  const [conversations, messages] = await Promise.all([db.conversations(), db.messages()]);
  const now = new Date().toISOString();
  const message: Message = {
    id: makeId('m'),
    conversationId,
    senderId,
    text: text.trim(),
    offer,
    createdAt: now,
  };
  const nextMessages = [...messages, message];
  const nextConversations = conversations.map((c) =>
    c.id === conversationId ? { ...c, updatedAt: now, readBy: [senderId] } : c,
  );
  await Promise.all([db.saveMessages(nextMessages), db.saveConversations(nextConversations)]);
  return { conversations: nextConversations, messages: nextMessages };
}

export async function markAsRead(
  conversationId: string,
  userId: string,
): Promise<Conversation[]> {
  const conversations = await db.conversations();
  const next = conversations.map((c) =>
    c.id === conversationId && !c.readBy.includes(userId)
      ? { ...c, readBy: [...c.readBy, userId] }
      : c,
  );
  await db.saveConversations(next);
  return next;
}
