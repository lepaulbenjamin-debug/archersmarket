import {
  toConversation,
  toMessage,
  type ConversationRow,
  type MessageRow,
} from '@/services/mappers';
import { fail, supabase } from '@/services/supabase';
import type { Conversation, Message } from '@/types';

const CONVERSATION_SELECT = 'id, listing_id, buyer_id, seller_id, updated_at';

export interface Threads {
  conversations: Conversation[];
  messages: Message[];
}

/** Conversations de l'utilisateur connecté, leurs messages et l'état de lecture. */
export async function fetchThreads(userId: string): Promise<Threads> {
  const { data: rows, error } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) fail(error, 'Chargement des conversations impossible.');

  const conversationRows = rows as ConversationRow[];
  if (conversationRows.length === 0) return { conversations: [], messages: [] };

  const ids = conversationRows.map((row) => row.id);

  const [readsResult, messagesResult] = await Promise.all([
    supabase.from('conversation_reads').select('conversation_id, read_at').eq('user_id', userId),
    supabase
      .from('messages')
      .select('id, conversation_id, sender_id, body, offer, created_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: true }),
  ]);
  if (readsResult.error) fail(readsResult.error, 'Chargement de l’état de lecture impossible.');
  if (messagesResult.error) fail(messagesResult.error, 'Chargement des messages impossible.');

  const reads = new Map(
    (readsResult.data as Array<{ conversation_id: string; read_at: string }>).map((row) => [
      row.conversation_id,
      row.read_at,
    ]),
  );

  return {
    conversations: conversationRows.map((row) => toConversation(row, reads.get(row.id) ?? null)),
    messages: (messagesResult.data as MessageRow[]).map(toMessage),
  };
}

/** Retourne la conversation existante pour ce couple annonce/acheteur, ou la crée. */
export async function openConversation(
  listingId: string,
  buyerId: string,
  sellerId: string,
): Promise<Conversation> {
  const { data: existing } = await supabase
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .maybeSingle();
  if (existing) return toConversation(existing as ConversationRow, null);

  const { data, error } = await supabase
    .from('conversations')
    .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
    .select(CONVERSATION_SELECT)
    .single();
  if (error || !data) fail(error, 'Ouverture de la conversation impossible.');
  return toConversation(data as ConversationRow, new Date().toISOString());
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  text: string,
  offer?: number,
): Promise<Message> {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body: text.trim(),
      offer: offer ?? null,
    })
    .select('id, conversation_id, sender_id, body, offer, created_at')
    .single();
  if (error || !data) fail(error, 'Envoi du message impossible.');
  return toMessage(data as MessageRow);
}

export async function markAsRead(conversationId: string, userId: string): Promise<string> {
  const readAt = new Date().toISOString();
  const { error } = await supabase
    .from('conversation_reads')
    .upsert(
      { conversation_id: conversationId, user_id: userId, read_at: readAt },
      { onConflict: 'conversation_id,user_id' },
    );
  if (error) fail(error, 'Mise à jour de l’état de lecture impossible.');
  return readAt;
}

/** Notifie à chaque nouveau message reçu dans l'une des conversations de l'utilisateur. */
export function subscribeToMessages(onMessage: (message: Message) => void) {
  const channel = supabase
    .channel('messages')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => onMessage(toMessage(payload.new as MessageRow)),
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
