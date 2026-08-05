import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as messagesService from '@/services/messages';
import { useAuth } from '@/store/AuthContext';
import type { Conversation, Message } from '@/types';

export interface Thread {
  conversation: Conversation;
  messages: Message[];
  lastMessage?: Message;
  unread: boolean;
  otherUserId: string;
}

interface MessagesValue {
  threads: Thread[];
  unreadCount: number;
  loading: boolean;
  threadById: (conversationId: string) => Thread | undefined;
  openConversation: (listingId: string, sellerId: string) => Promise<string>;
  sendMessage: (conversationId: string, text: string, offer?: number) => Promise<void>;
  markAsRead: (conversationId: string) => Promise<void>;
}

const MessagesContext = createContext<MessagesValue | null>(null);

export function MessagesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await messagesService.fetchThreads();
      setConversations(data.conversations);
      setMessages(data.messages);
      setLoading(false);
    })();
  }, []);

  const threads = useMemo<Thread[]>(() => {
    if (!user) return [];
    return conversations
      .filter((c) => c.buyerId === user.id || c.sellerId === user.id)
      .map((conversation) => {
        const threadMessages = messages
          .filter((m) => m.conversationId === conversation.id)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        return {
          conversation,
          messages: threadMessages,
          lastMessage: threadMessages[threadMessages.length - 1],
          unread: !conversation.readBy.includes(user.id),
          otherUserId: conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId,
        };
      })
      .sort(
        (a, b) =>
          Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt),
      );
  }, [conversations, messages, user]);

  const unreadCount = useMemo(() => threads.filter((t) => t.unread).length, [threads]);

  const threadById = useCallback(
    (conversationId: string) => threads.find((t) => t.conversation.id === conversationId),
    [threads],
  );

  const openConversation = useCallback(
    async (listingId: string, sellerId: string) => {
      if (!user) throw new Error('Connectez-vous pour contacter un vendeur.');
      const conversation = await messagesService.openConversation(listingId, user.id, sellerId);
      setConversations((prev) =>
        prev.some((c) => c.id === conversation.id) ? prev : [conversation, ...prev],
      );
      return conversation.id;
    },
    [user],
  );

  const sendMessage = useCallback(
    async (conversationId: string, text: string, offer?: number) => {
      if (!user || !text.trim()) return;
      const data = await messagesService.sendMessage(conversationId, user.id, text, offer);
      setConversations(data.conversations);
      setMessages(data.messages);
    },
    [user],
  );

  const markAsRead = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      setConversations(await messagesService.markAsRead(conversationId, user.id));
    },
    [user],
  );

  const value = useMemo<MessagesValue>(
    () => ({ threads, unreadCount, loading, threadById, openConversation, sendMessage, markAsRead }),
    [loading, markAsRead, openConversation, sendMessage, threadById, threads, unreadCount],
  );

  return <MessagesContext.Provider value={value}>{children}</MessagesContext.Provider>;
}

export function useMessages(): MessagesValue {
  const ctx = useContext(MessagesContext);
  if (!ctx) throw new Error('useMessages doit être utilisé dans MessagesProvider.');
  return ctx;
}
