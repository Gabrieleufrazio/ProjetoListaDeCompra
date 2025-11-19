import { Basket, TipsResponse } from './types';

// Simple market-basket recommender using co-occurrence, confidence and lift
// Input: items[] (current list), baskets[] (history)
// Returns ranked array of { item, score, confidence, lift, support }

export function recommendItems(currentItems: string[], baskets: Basket[], { limit = 10, minSupport = 0.01 }: { limit?: number; minSupport?: number } = {}) {
  const itemsSet = new Set(currentItems.map(safe));
  const total = baskets.length || 1;
  const supportItem = new Map<string, number>();
  const supportPair = new Map<string, number>(); // key: a||b

  // Count supports
  for (const b of baskets) {
    const uniq = Array.from(new Set((b.items || []).map(safe)));
    for (let i = 0; i < uniq.length; i++) {
      const a = uniq[i];
      supportItem.set(a, (supportItem.get(a) || 0) + 1);
      for (let j = i + 1; j < uniq.length; j++) {
        const bItem = uniq[j];
        const [x, y] = a < bItem ? [a, bItem] : [bItem, a];
        const key = `${x}||${y}`;
        supportPair.set(key, (supportPair.get(key) || 0) + 1);
      }
    }
  }

  const support = (x: string) => (supportItem.get(x) || 0) / total;
  const supportXY = (x: string, y: string) => {
    const [a, b] = x < y ? [x, y] : [y, x];
    const key = `${a}||${b}`;
    return (supportPair.get(key) || 0) / total;
  };

  const candidates = new Map<string, { score: number; confidence: number; lift: number; support: number }>();

  for (const y of supportItem.keys()) {
    if (itemsSet.has(y)) continue; // don't recommend items already in list

    // Compute best rule X -> y for X in currentItems
    let best = { score: 0, confidence: 0, lift: 0, support: support(y) };

    if (best.support < minSupport) continue;

    for (const x of itemsSet) {
      const sX = support(x);
      if (sX === 0) continue;
      const sXY = supportXY(x, y);
      if (sXY === 0) continue;
      const conf = sXY / sX; // P(y|x)
      const lift = conf / (support(y) || 1e-9);
      const score = 0.6 * conf + 0.4 * Math.min(lift, 3); // blend metrics
      if (score > best.score) best = { score, confidence: conf, lift, support: support(y) };
    }

    if (best.score > 0) candidates.set(y, best);
  }

  // Fallback: if empty, propose popular items not in list
  if (candidates.size === 0) {
    for (const [item, cnt] of supportItem.entries()) {
      if (itemsSet.has(item)) continue;
      candidates.set(item, { score: cnt / total, confidence: 0, lift: 1, support: cnt / total });
    }
  }

  const result = Array.from(candidates.entries())
    .map(([item, m]) => ({ item, ...m }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return result;
}

// Build shopping tips to help at the market
// Returns: { complements: [...], seasonal: [...], replenishment: [...] }
export function buildTips(currentItems: string[], baskets: Basket[]): TipsResponse {
  const items = currentItems.map(safe);

  // 1) Complements via recommender and a few domain rules
  const recs = recommendItems(items, baskets, { limit: 8 });
  const rulePairs: [string, string][] = [
    ['pão', 'manteiga'], ['pão', 'queijo'],
    ['macarrão', 'molho de tomate'],
    ['arroz', 'feijão'],
    ['café', 'filtro de café'],
    ['leite', 'cereal'],
    ['carne', 'carvão'],
  ];
  const extra: { item: string; reason: string }[] = [];
  const set = new Set(items);
  for (const [a, b] of rulePairs) {
    if (set.has(a) && !set.has(b)) extra.push({ item: b, reason: `Complementa ${a}` });
    if (set.has(b) && !set.has(a)) extra.push({ item: a, reason: `Complementa ${b}` });
  }
  const complements = [
    ...recs.map(r => ({ item: r.item, score: r.score, reason: 'Frequente com seus itens' } as const)),
    ...extra
  ]
    .filter((v, i, a) => a.findIndex(x => x.item === v.item) === i)
    .slice(0, 10);

  // 2) Seasonal suggestions based on month
  const month = new Date().getMonth() + 1;
  const seasonalMap: Record<number, string[]> = {
    1: ['protetor solar', 'água'],
    2: ['protetor solar', 'carvão'],
    3: ['chocolate'], // Páscoa geralmente mar/abril
    4: ['chocolate'],
    5: ['caldos prontos', 'chá'],
    6: ['quentão', 'milho', 'amendoim'], // festas juninas
    7: ['chocolate quente', 'sopas'],
    8: ['itens escolares'],
    9: ['frutas da estação'],
    10: ['doces'],
    11: ['panetone', 'nozes'],
    12: ['panetone', 'chocotone', 'espumante']
  };
  const seasonal = (seasonalMap[month] || []).map(s => ({ item: s, reason: 'Sazonal' }));

  // 3) Replenishment: estimate average interval between purchases for each item
  const itemDates = new Map<string, number[]>(); // name -> [timestamps]
  for (const b of baskets) {
    const ts = Date.parse(b.createdAt);
    if (!isFinite(ts)) continue;
    for (const it of (b.items || [])) {
      const n = safe(it);
      if (!itemDates.has(n)) itemDates.set(n, []);
      itemDates.get(n)!.push(ts);
    }
  }
  const now = Date.now();
  const replenishment: { item: string; reason: string }[] = [];
  for (const [name, arr] of itemDates.entries()) {
    if (arr.length < 2) continue;
    const sorted = arr.sort((a, b) => a - b);
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) intervals.push((sorted[i] - sorted[i - 1]) / (1000 * 60 * 60 * 24));
    const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const last = sorted[sorted.length - 1];
    const daysSince = (now - last) / (1000 * 60 * 60 * 24);
    if (daysSince >= Math.max(7, avg - 1) && !set.has(name)) {
      replenishment.push({ item: name, reason: `Você costuma comprar a cada ~${Math.round(avg)} dias` });
    }
  }
  replenishment.sort((a, b) => a.reason.localeCompare(b.reason));

  return { complements, seasonal, replenishment };
}

export function safe(s: string) {
  return String(s || '').trim().toLowerCase();
}
