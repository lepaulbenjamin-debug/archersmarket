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

  const reload = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setMessages([]);
      setLoading(false);
      return;
    }
    try {
      const data = await messagesService.fetchThreads(user.id);
      setConversations(data.conversations);
      setMessages(data.messages);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setLoading(true);
    reload();
  }, [reload]);

  // Temps réel : un message reçu apparaît sans rafraîchir.
  useEffect(() => {
    if (!user) return;
    return messagesService.subscribeToMessages((message) => {
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setConversations((prev) => {
        const known = prev.some((c) => c.id === message.conversationId);
        if (!known) {
          // Première conversation ouverte par un acheteur : on recharge.
          reload();
          return prev;
        }
        return prev.map((c) =>
          c.id === message.conversationId ? { ...c, updatedAt: message.createdAt } : c,
        );
      });
    });
  }, [reload, user]);

  const threads = useMemo<Thread[]>(() => {
    if (!user) return [];
    return conversations
      .map((conversation) => {
        const threadMessages = messages
          .filter((m) => m.conversationId === conversation.id)
          .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
        const lastMessage = threadMessages[threadMessages.length - 1];
        const unread =
          !!lastMessage &&
          lastMessage.senderId !== user.id &&
          (!conversation.readAt || Date.parse(conversation.readAt) < Date.parse(lastMessage.createdAt));
        return {
          conversation,
          messages: threadMessages,
          lastMessage,
          unread,
          otherUserId:
            conversation.buyerId === user.id ? conversation.sellerId : conversation.buyerId,
        };
      })
      .sort(
        (a, b) => Date.parse(b.conversation.updatedAt) - Date.parse(a.conversation.updatedAt),
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
      const message = await messagesService.sendMessage(conversationId, user.id, text, offer);
      setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setConversations((prev) =>
        prev.map((c) =>
          c.id === conversationId
            ? { ...c, updatedAt: message.createdAt, readAt: message.createdAt }
            : c,
        ),
      );
    },
    [user],
  );

  const markAsRead = useCallback(
    async (conversationId: string) => {
      if (!user) return;
      const readAt = await messagesService.markAsRead(conversationId, user.id);
      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, readAt } : c)),
      );
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
