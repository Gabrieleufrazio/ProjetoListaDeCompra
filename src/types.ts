export interface DetailedItem {
  name: string;
  qty?: number | null;
  category?: string | null;
  unit?: string | null; // ex.: kg, un, L
  price?: number | null; // preço unitário ou total do item
}

export interface Basket {
  id: string;
  items: string[];
  itemsDetailed: DetailedItem[] | null;
  store: string | null;
  total: number | null;
  createdAt: string; // ISO
  userId?: string; // dono da lista (para multiusuário)
}

export interface TipsResponse {
  complements: { item: string; reason?: string; score?: number }[];
  seasonal: { item: string; reason?: string }[];
  replenishment: { item: string; reason?: string }[];
}

export interface ChatRequestBody {
  message: string;
  items?: string[];
  budget?: number;
}

export interface ChatMessage {
  role: 'assistant' | 'user';
  text: string;
}

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}
