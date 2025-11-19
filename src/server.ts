import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { ensureDataDir, addBasket, getBaskets, getPopularItems, listAll, getBasket, updateBasket, deleteBasket } from './store';
import { recommendItems, buildTips, safe } from './recommender';
import { Basket, ChatRequestBody, TipsResponse } from './types';
import { requireAuth, register, login } from './auth';
import { askLLM, llmAvailable } from './llm';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Health
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Auth
app.post('/api/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password || String(password).length < 4) return res.status(400).json({ error: 'invalid' });
    const user = await register(String(email).trim().toLowerCase(), String(password));
    const token = await login(user.email, String(password));
    res.json({ token });
  } catch (e: any) {
    if (e?.message === 'email_in_use') return res.status(409).json({ error: 'email_in_use' });
    res.status(500).json({ error: 'register_failed' });
  }
});

app.post('/api/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'invalid' });
    const token = await login(String(email).trim().toLowerCase(), String(password));
    res.json({ token });
  } catch {
    res.status(401).json({ error: 'invalid_credentials' });
  }
});

// CRUD endpoints for lists
app.get('/api/lists', requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await listAll((req as any).userId);
    res.json({ count: rows.length, baskets: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar listas' });
  }
});

app.get('/api/lists/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const b = await getBasket(String(req.params.id));
    if (!b) return res.status(404).json({ error: 'Não encontrado' });
    if (b.userId && b.userId !== (req as any).userId) return res.status(403).json({ error: 'forbidden' });
    res.json(b);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao obter lista' });
  }
});

app.put('/api/lists/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const patch = req.body || {};
    const normalized = {
      items: Array.isArray(patch.items) ? patch.items.map((x: any) => String(x || '').trim().toLowerCase()).filter(Boolean) : undefined,
      itemsDetailed: Array.isArray(patch.itemsDetailed) ? patch.itemsDetailed.map((it: any) => ({
        name: String(it?.name ?? '').trim().toLowerCase(),
        qty: Number(it?.qty) > 0 ? Number(it.qty) : 1,
        category: it?.category ? String(it.category).trim() : null,
        unit: it?.unit ? String(it.unit).trim() : null,
        price: it?.price != null ? Number(it.price) : null
      })) : undefined,
      store: patch.store ?? undefined,
      total: (patch.total !== undefined && patch.total !== null) ? Number(patch.total) : undefined
    };
    const updated = await updateBasket(String(req.params.id), normalized as any);
    if (!updated) return res.status(404).json({ error: 'Não encontrado' });
    if (updated.userId && updated.userId !== (req as any).userId) return res.status(403).json({ error: 'forbidden' });
    res.json({ ok: true, basket: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao atualizar lista' });
  }
});

app.delete('/api/lists/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const ok = await deleteBasket(String(req.params.id));
    if (!ok) return res.status(404).json({ error: 'Não encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir lista' });
  }
});

// Submit a shopping list (basket)
// Body: { items?: string[], itemsDetailed?: {name, qty?, category?}[], store?: string, total?: number }
app.post('/api/list', requireAuth, async (req: Request, res: Response) => {
  try {
    const { items, itemsDetailed, store, total } = req.body || {};
    const detailed = Array.isArray(itemsDetailed) ? itemsDetailed
      .map((it: any) => ({
        name: String(it?.name ?? it?.item ?? '').trim().toLowerCase(),
        qty: Number(it?.qty) > 0 ? Number(it.qty) : 1,
        category: it?.category ? String(it.category).trim() : null,
        unit: it?.unit ? String(it.unit).trim() : null,
        price: it?.price != null ? Number(it.price) : null
      }))
      .filter((it: any) => it.name.length > 0) : [];

    const baseItems = Array.isArray(items) ? items : detailed.map((d: any) => d.name);
    if (!Array.isArray(baseItems) || baseItems.length === 0) {
      return res.status(400).json({ error: 'items ou itemsDetailed deve conter ao menos 1 item' });
    }
    const cleanItems = baseItems.map((v: any) => String(v || '').trim().toLowerCase()).filter(Boolean);
    if (cleanItems.length === 0) return res.status(400).json({ error: 'items inválidos' });

    const basket = await addBasket({ items: cleanItems, itemsDetailed: detailed.length ? detailed : null, store: store || null, total: Number(total) || null, userId: (req as any).userId });
    res.status(201).json({ ok: true, basket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar lista' });
  }
});

// Get purchase history (last N)
app.get('/api/history', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const baskets = await getBaskets(limit, (req as any).userId);
    res.json({ count: baskets.length, baskets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao obter histórico' });
  }
});

// Popular items
app.get('/api/popular', requireAuth, async (req: Request, res: Response) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const popular = await getPopularItems(limit, (req as any).userId);
    res.json({ items: popular });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao obter itens populares' });
  }
});

// Recommendations given current items
// /api/recommendations?items=arroz,feijao,carne&limit=10
app.get('/api/recommendations', requireAuth, async (req: Request, res: Response) => {
  try {
    const itemsParam = (req.query.items || '').toString();
    const items = itemsParam
      .split(',')
      .map((v: string) => v.trim().toLowerCase())
      .filter((v: string) => v);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));

    const baskets = await getBaskets(10000, (req as any).userId); // use all for better stats
    const recs = recommendItems(items, baskets, { limit });
    res.json({ items: recs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao calcular recomendações' });
  }
});

// Tips (IA ajuda no mercado): reposição, sazonais, complementos
app.get('/api/tips', requireAuth, async (req: Request, res: Response) => {
  try {
    const itemsParam = (req.query.items || '').toString();
    const currentItems = itemsParam
      .split(',')
      .map((v: string) => v.trim().toLowerCase())
      .filter((v: string) => Boolean(v));
    const baskets = await getBaskets(10000, (req as any).userId);
    const tips = buildTips(currentItems, baskets);
    res.json(tips);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar dicas' });
  }
});

// Simple rule-based chatbot leveraging existing ML and tips
app.post('/api/chat', requireAuth, async (req: Request<{}, {}, ChatRequestBody>, res: Response) => {
  try {
    const message = String(req.body?.message || '').trim();
    const items = (req.body?.items || []).map(safe);
    const budget = Number(req.body?.budget) || null;

    const baskets = await getBaskets(10000, (req as any).userId);
    const tips = buildTips(items, baskets);
    const recs = recommendItems(items, baskets, { limit: 10 });

    // If LLM key available, try LLM first for a smarter answer
    if (llmAvailable()) {
      try {
        const llmLines = await askLLM(message, { items, budget, recs, tips });
        if (llmLines && llmLines.length) {
          return res.json({ messages: llmLines.map(t => ({ role: 'assistant', text: t })) });
        }
      } catch (e) {
        // fallthrough to rule-based
        console.warn('LLM fallback due to error');
      }
    }

    const lower = message.toLowerCase();
    const replies: string[] = [];

    if (!message) {
      replies.push('Oi! Posso sugerir complementos, indicar itens sazonais, lembrar de reposições e até ajudar com orçamento. O que você precisa hoje?');
    }

    if (lower.includes('complement')) {
      const c = tips.complements.slice(0, 5).map(x => x.item).join(', ');
      if (c) replies.push(`Complementos que combinam com sua lista: ${c}.`);
    }

    if (lower.includes('sazon') || lower.includes('época')) {
      const s = tips.seasonal.slice(0, 5).map(x => x.item).join(', ');
      if (s) replies.push(`Itens sazonais do momento: ${s}.`);
    }

    if (lower.includes('rep') || lower.includes('falta') || lower.includes('repor')) {
      const r = tips.replenishment.slice(0, 5).map(x => x.item).join(', ');
      if (r) replies.push(`Talvez seja hora de repor: ${r}.`);
    }

    if (lower.includes('barato') || lower.includes('econom') || budget) {
      const staples = ['arroz', 'feijão', 'macarrão', 'molho de tomate', 'ovos', 'farinha', 'açúcar'];
      const missing = staples.filter(s => !items.includes(s));
      if (missing.length) replies.push(`Para economizar, priorize itens básicos e com bom custo-benefício como: ${missing.slice(0,6).join(', ')}.`);
      if (budget) replies.push(`Defina um teto por categoria e compare marcas no mercado. Seu orçamento estimado é R$ ${budget.toFixed(2)}.`);
    }

    if (lower.includes('recomenda') || lower.includes('sugere')) {
      const r = recs.slice(0, 6).map(x => x.item).join(', ');
      if (r) replies.push(`Com base na sua lista, eu sugiro: ${r}.`);
    }

    if (replies.length === 0) {
      // default helpful summary
      const mix = [
        tips.complements.slice(0, 3).map(x => x.item),
        tips.seasonal.slice(0, 2).map(x => x.item),
        tips.replenishment.slice(0, 2).map(x => x.item)
      ].flat();
      const base = mix.length ? `Sugestões agora: ${mix.join(', ')}.` : 'Posso analisar sua lista e sugerir complementos, sazonais e reposições.';
      replies.push(base);
    }
    res.json({ messages: replies.map(t => ({ role: 'assistant', text: t })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Falha no chatbot' });
  }
});

// Export user history (all baskets for logged user)
app.get('/api/export', requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await listAll((req as any).userId);
    res.json({ baskets: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao exportar histórico' });
  }
});

// Import user history: expects { baskets: [...] }
app.post('/api/import', requireAuth, async (req: Request, res: Response) => {
  try {
    const arr = Array.isArray((req.body as any)?.baskets) ? (req.body as any).baskets : [];
    if (!arr.length) return res.status(400).json({ error: 'nada_para_importar' });
    let count = 0;
    for (const b of arr) {
      const itemsDetailed = Array.isArray(b.itemsDetailed) ? b.itemsDetailed.map((it: any) => ({
        name: String(it?.name||'').trim().toLowerCase(),
        qty: Number(it?.qty) > 0 ? Number(it.qty) : 1,
        category: it?.category ? String(it.category).trim() : null,
        unit: it?.unit ? String(it.unit).trim() : null,
        price: it?.price != null ? Number(it.price) : null,
      })).filter((it: any) => it.name) : [];
      const items = Array.isArray(b.items) ? b.items.map((x: any) => String(x||'').trim().toLowerCase()).filter(Boolean) : itemsDetailed.map((d:any)=>d.name);
      if (items.length === 0) continue;
      await addBasket({ items, itemsDetailed: itemsDetailed.length?itemsDetailed:null, store: b.store||null, total: b.total!=null?Number(b.total):null, userId: (req as any).userId });
      count++;
    }
    res.json({ ok: true, imported: count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao importar histórico' });
  }
});

// Price insights per item (avg, last, change)
app.get('/api/insights/prices', requireAuth, async (req: Request, res: Response) => {
  try {
    const baskets = await listAll((req as any).userId);
    const map = new Map<string, number[]>();
    for (const b of baskets) {
      for (const d of (b.itemsDetailed||[])) {
        if (d.price == null) continue;
        const name = String(d.name).toLowerCase();
        if (!map.has(name)) map.set(name, []);
        map.get(name)!.push(Number(d.price));
      }
    }
    const insights = Array.from(map.entries()).map(([item, prices]) => {
      const avg = prices.reduce((a,b)=>a+b,0)/prices.length;
      const last = prices[prices.length-1];
      const prev = prices.length>1 ? prices[prices.length-2] : null;
      const change = prev!=null && prev!==0 ? ((last - prev)/prev)*100 : null;
      return { item, avg: Number(avg.toFixed(2)), last: Number(last.toFixed(2)), change: change!=null?Number(change.toFixed(2)):null, count: prices.length };
    }).sort((a,b)=> (b.count - a.count) || a.item.localeCompare(b.item));
    res.json({ items: insights });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao obter insights de preços' });
  }
});

app.listen(PORT, async () => {
  await ensureDataDir();
  console.log(`Servidor TS iniciado em http://localhost:${PORT}`);
});
