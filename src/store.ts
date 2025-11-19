import fs from 'fs/promises';
import path from 'path';
import { Basket, DetailedItem } from './types';

const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

export async function ensureDataDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(HISTORY_FILE);
  } catch {
    await fs.writeFile(HISTORY_FILE, JSON.stringify({ baskets: [] }, null, 2), 'utf-8');
  }
}

async function readHistory(): Promise<{ baskets: Basket[] }> {
  await ensureDataDir();
  const raw = await fs.readFile(HISTORY_FILE, 'utf-8');
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.baskets)) return { baskets: [] };
    return data;
  } catch {
    return { baskets: [] };
  }
}

async function writeHistory(data: { baskets: Basket[] }): Promise<void> {
  await fs.writeFile(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function addBasket({ items, itemsDetailed = null, store = null, total = null, userId }: { items: string[]; itemsDetailed?: DetailedItem[] | null; store?: string | null; total?: number | null; userId?: string; }): Promise<Basket> {
  const data = await readHistory();
  const basket: Basket = {
    id: cryptoRandomId(),
    items: Array.from(new Set(items)),
    itemsDetailed: Array.isArray(itemsDetailed) && itemsDetailed.length ? itemsDetailed : null,
    store: store ?? null,
    total: total ?? null,
    createdAt: new Date().toISOString(),
    userId
  };
  data.baskets.push(basket);
  await writeHistory(data);
  return basket;
}

export async function getBaskets(limit = 50, userId?: string): Promise<Basket[]> {
  const data = await readHistory();
  const list = data.baskets
    .filter(b => !userId || b.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  if (!limit) return list;
  return list.slice(0, limit);
}

export async function getPopularItems(limit = 20, userId?: string): Promise<{ item: string; count: number }[]> {
  const baskets = await getBaskets(10000, userId);
  const freq = new Map<string, number>();
  for (const b of baskets) {
    for (const it of b.items) {
      freq.set(it, (freq.get(it) || 0) + 1);
    }
  }
  const items = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([item, count]) => ({ item, count }));
  return items;
}

function cryptoRandomId(): string {
  return 'bkt_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// CRUD helpers
export async function listAll(userId?: string): Promise<Basket[]> {
  const data = await readHistory();
  return data.baskets
    .filter(b => !userId || b.userId === userId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getBasket(id: string): Promise<Basket | null> {
  const data = await readHistory();
  return data.baskets.find(b => b.id === id) || null;
}

export async function updateBasket(id: string, patch: Partial<Omit<Basket, 'id'|'createdAt'>>): Promise<Basket | null> {
  const data = await readHistory();
  const idx = data.baskets.findIndex(b => b.id === id);
  if (idx === -1) return null;
  const prev = data.baskets[idx];
  const updated: Basket = {
    ...prev,
    items: patch.items ? Array.from(new Set(patch.items)) : prev.items,
    itemsDetailed: (patch as any).itemsDetailed !== undefined ? (patch as any).itemsDetailed as any : prev.itemsDetailed,
    store: patch.store !== undefined ? (patch.store ?? null) : prev.store,
    total: patch.total !== undefined ? (patch.total ?? null) : prev.total,
  };
  data.baskets[idx] = updated;
  await writeHistory(data);
  return updated;
}

export async function deleteBasket(id: string): Promise<boolean> {
  const data = await readHistory();
  const before = data.baskets.length;
  data.baskets = data.baskets.filter(b => b.id !== id);
  const changed = data.baskets.length !== before;
  if (changed) await writeHistory(data);
  return changed;
}
