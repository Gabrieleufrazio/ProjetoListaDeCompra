// Use global fetch (Node 18+) to avoid extra deps
declare const fetch: any;

export interface ChatContext {
  items: string[];
  budget?: number | null;
  recs?: { item: string; score?: number }[];
  tips?: {
    complements: { item: string }[];
    seasonal: { item: string }[];
    replenishment: { item: string }[];
  };
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

export const llmAvailable = () => Boolean(OPENAI_API_KEY);

export async function askLLM(message: string, ctx: ChatContext): Promise<string[]> {
  if (!OPENAI_API_KEY) return [];
  const sys = `Você é um assistente de compras brasileiro. Responda em português do Brasil.
Regras:
- Use frases curtas e objetivas.
- Considere a lista atual, orçamento (se houver) e histórico de sugestões.
- Sugira complementos, sazonais, reposição e oportunidades de economia.
- Se o usuário pedir recomendações, cite até 6 itens priorizando relevância.
- Se houver orçamento, aponte prioridades e trade-offs.
`;
  const contextParts: string[] = [];
  if (ctx.items?.length) contextParts.push(`Itens atuais: ${ctx.items.join(', ')}`);
  if (ctx.budget) contextParts.push(`Orçamento: R$ ${ctx.budget.toFixed(2)}`);
  if (ctx.recs?.length) contextParts.push(`Recomendações (backend): ${ctx.recs.slice(0,6).map(r=>r.item).join(', ')}`);
  if (ctx.tips) {
    if (ctx.tips.complements?.length) contextParts.push(`Complementos: ${ctx.tips.complements.slice(0,5).map(x=>x.item).join(', ')}`);
    if (ctx.tips.seasonal?.length) contextParts.push(`Sazonais: ${ctx.tips.seasonal.slice(0,5).map(x=>x.item).join(', ')}`);
    if (ctx.tips.replenishment?.length) contextParts.push(`Reposição: ${ctx.tips.replenishment.slice(0,5).map(x=>x.item).join(', ')}`);
  }
  const userPrompt = [contextParts.join('\n'), `Pergunta do usuário: ${message}`].filter(Boolean).join('\n\n');

  const body = {
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.4,
  };

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) {
    // allow fallback silently
    return [];
  }
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content?.trim?.() || '';
  if (!text) return [];
  // Split into sentences or bullet lines
  const lines = text.split(/\n+/).map((s: string) => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
  return lines.length ? lines : [text];
}
