import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDataDir, addBasket, getBaskets, getPopularItems } from './src/store.js';
import { recommendItems, buildTips } from './src/recommender.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Submit a shopping list (basket)
// Body: { items?: string[], itemsDetailed?: {name, qty?, category?}[], store?: string, total?: number }
app.post('/api/list', async (req, res) => {
  try {
    const { items, itemsDetailed, store, total } = req.body || {};
    const detailed = Array.isArray(itemsDetailed) ? itemsDetailed
      .map(it => ({
        name: String(it?.name ?? it?.item ?? '').trim().toLowerCase(),
        qty: Number(it?.qty) > 0 ? Number(it.qty) : 1,
        category: it?.category ? String(it.category).trim() : null
      }))
      .filter(it => it.name.length > 0) : [];

    const baseItems = Array.isArray(items) ? items : detailed.map(d => d.name);
    if (!Array.isArray(baseItems) || baseItems.length === 0) {
      return res.status(400).json({ error: 'items ou itemsDetailed deve conter ao menos 1 item' });
    }
    const cleanItems = baseItems.map(v => String(v || '').trim().toLowerCase()).filter(Boolean);
    if (cleanItems.length === 0) return res.status(400).json({ error: 'items inválidos' });

    const basket = await addBasket({ items: cleanItems, itemsDetailed: detailed.length ? detailed : null, store: store || null, total: Number(total) || null });
    res.status(201).json({ ok: true, basket });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao salvar lista' });
  }
});

// Get purchase history (last N)
app.get('/api/history', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 50));
    const baskets = await getBaskets(limit);
    res.json({ count: baskets.length, baskets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao obter histórico' });
  }
});

// Popular items
app.get('/api/popular', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 20));
    const popular = await getPopularItems(limit);
    res.json({ items: popular });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao obter itens populares' });
  }
});

// Recommendations given current items
// /api/recommendations?items=arroz,feijao,carne&limit=10
app.get('/api/recommendations', async (req, res) => {
  try {
    const itemsParam = (req.query.items || '').toString();
    const items = itemsParam
      .split(',')
      .map(v => v.trim().toLowerCase())
      .filter(v => v);
    const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 10));

    const baskets = await getBaskets(10000); // use all for better stats
    const recs = recommendItems(items, baskets, { limit });
    res.json({ items: recs });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao calcular recomendações' });
  }
});

// Tips (IA ajuda no mercado): reposição, sazonais, complementos
app.get('/api/tips', async (req, res) => {
  try {
    const itemsParam = (req.query.items || '').toString();
    const currentItems = itemsParam
      .split(',')
      .map(v => v.trim().toLowerCase())
      .filter(Boolean);
    const baskets = await getBaskets(10000);
    const tips = buildTips(currentItems, baskets);
    res.json(tips);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar dicas' });
  }
});

app.listen(PORT, async () => {
  await ensureDataDir();
  console.log(`Servidor iniciado em http://localhost:${PORT}`);
});
