import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'history.json');

export async function ensureDataDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(HISTORY_FILE);
  } catch {
    await fs.writeFile(HISTORY_FILE, JSON.stringify({ baskets: [] }, null, 2), 'utf-8');
  }
}

async function readHistory() {
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

async function writeHistory(data) {
  await fs.writeFile(HISTORY_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function addBasket({ items, itemsDetailed = null, store = null, total = null }) {
  const data = await readHistory();
  const basket = {
    id: cryptoRandomId(),
    items: Array.from(new Set(items)),
    itemsDetailed: Array.isArray(itemsDetailed) && itemsDetailed.length ? itemsDetailed : null,
    store,
    total,
    createdAt: new Date().toISOString()
  };
  data.baskets.push(basket);
  await writeHistory(data);
  return basket;
}

export async function getBaskets(limit = 50) {
  const data = await readHistory();
  const list = data.baskets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!limit) return list;
  return list.slice(0, limit);
}

export async function getPopularItems(limit = 20) {
  const baskets = await getBaskets(10000);
  const freq = new Map();
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

function cryptoRandomId() {
  // Simple random id
  return 'bkt_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
