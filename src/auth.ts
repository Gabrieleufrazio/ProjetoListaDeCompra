import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { User } from './types';

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

async function ensureUsersFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try { await fs.access(USERS_FILE); } catch { await fs.writeFile(USERS_FILE, JSON.stringify({ users: [] }, null, 2), 'utf-8'); }
}

async function readUsers(): Promise<{ users: User[] }> {
  await ensureUsersFile();
  const raw = await fs.readFile(USERS_FILE, 'utf-8');
  try { const data = JSON.parse(raw); if (!Array.isArray(data.users)) return { users: [] }; return data; } catch { return { users: [] }; }
}

async function writeUsers(data: { users: User[] }) {
  await fs.writeFile(USERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(8).toString('hex');
  const h = crypto.createHash('sha256').update(password + salt).digest('hex');
  return `${salt}:${h}`;
}

function verifyPassword(password: string, passwordHash: string): boolean {
  const [salt, h] = passwordHash.split(':');
  const calc = crypto.createHash('sha256').update(password + salt).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(h));
}

export async function register(email: string, password: string): Promise<User> {
  const data = await readUsers();
  const exists = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (exists) throw new Error('email_in_use');
  const user: User = { id: 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2,8), email, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
  data.users.push(user);
  await writeUsers(data);
  return user;
}

export async function login(email: string, password: string): Promise<string> {
  const data = await readUsers();
  const user = data.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) throw new Error('invalid_credentials');
  if (!verifyPassword(password, user.passwordHash)) throw new Error('invalid_credentials');
  const token = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  return token;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'unauthorized' });
  try {
    const payload = jwt.verify(m[1], JWT_SECRET) as any;
    (req as any).userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

export async function getUserById(id: string) {
  const data = await readUsers();
  return data.users.find(u => u.id === id) || null;
}
