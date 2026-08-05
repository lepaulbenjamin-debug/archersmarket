import { db, delay, makeId } from '@/services/db';
import { keys, readJSON, removeKey, writeJSON } from '@/services/storage';
import type { User } from '@/types';

const AVATAR_COLORS = ['#1B1B1D', '#F5843C', '#58585A', '#3E5C76', '#8A5A44', '#4A4A4E'];

export interface Credentials {
  email: string;
  password: string;
}

export interface SignUpInput extends Credentials {
  name: string;
  city: string;
  club?: string;
}

const normalize = (email: string) => email.trim().toLowerCase();

/** Retire le mot de passe avant de faire circuler l'utilisateur dans l'app. */
const publicUser = (user: User): User => {
  const { password: _password, ...rest } = user;
  return rest;
};

export async function restoreSession(): Promise<User | null> {
  const userId = await readJSON<string | null>(keys.session, null);
  if (!userId) return null;
  const users = await db.users();
  const found = users.find((u) => u.id === userId);
  return found ? publicUser(found) : null;
}

export async function signIn({ email, password }: Credentials): Promise<User> {
  await delay();
  const users = await db.users();
  const user = users.find((u) => normalize(u.email) === normalize(email));
  if (!user) throw new Error('Aucun compte ne correspond à cette adresse e-mail.');
  if (user.password !== password) throw new Error('Mot de passe incorrect.');
  await writeJSON(keys.session, user.id);
  return publicUser(user);
}

export async function signUp(input: SignUpInput): Promise<User> {
  await delay();
  const users = await db.users();
  if (users.some((u) => normalize(u.email) === normalize(input.email))) {
    throw new Error('Un compte existe déjà avec cette adresse e-mail.');
  }
  const user: User = {
    id: makeId('u'),
    name: input.name.trim(),
    handle: input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 18) || 'archer',
    email: normalize(input.email),
    password: input.password,
    city: input.city.trim(),
    club: input.club?.trim() || undefined,
    avatarColor: AVATAR_COLORS[users.length % AVATAR_COLORS.length],
    rating: 0,
    reviewCount: 0,
    memberSince: new Date().toISOString().slice(0, 10),
  };
  await db.saveUsers([...users, user]);
  await writeJSON(keys.session, user.id);
  return publicUser(user);
}

export async function signOut(): Promise<void> {
  await removeKey(keys.session);
}

export async function updateProfile(userId: string, patch: Partial<User>): Promise<User> {
  await delay(120);
  const users = await db.users();
  const next = users.map((u) => (u.id === userId ? { ...u, ...patch, id: u.id } : u));
  await db.saveUsers(next);
  const updated = next.find((u) => u.id === userId);
  if (!updated) throw new Error('Utilisateur introuvable.');
  return publicUser(updated);
}

export async function getUser(userId: string): Promise<User | null> {
  const users = await db.users();
  const found = users.find((u) => u.id === userId);
  return found ? publicUser(found) : null;
}

export async function getUsers(): Promise<User[]> {
  const users = await db.users();
  return users.map(publicUser);
}
