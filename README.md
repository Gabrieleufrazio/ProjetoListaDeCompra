<<<<<<< HEAD
# ProjetoListaDeCompra
Projeto com Intenção de ajudar pessoas com compras no mercado, utilizando IA para Sugestão 
=======
# Lista de Compras com IA (Node.js + Tailwind)

Aplicativo full-stack simples para criar listas de compras e receber recomendações inteligentes (machine learning leve) com base no histórico de compras.

- Backend: Node.js (Express)
- Frontend: HTML + Tailwind (via CDN) + JavaScript
- ML: análise de coocorrência de itens (market-basket), calculando confiança e lift
- Persistência: arquivo JSON local `data/history.json`

## Como executar

1. Requisitos: Node.js 18+
2. Instale dependências:

```
npm install
```

3. Executar em desenvolvimento (com recarregamento automático):

```
npm run dev
```

4. Acessar:

- http://localhost:3000

5. Produção local:

```
npm start
```

## Endpoints principais

- `POST /api/list` — salva uma compra: `{ items: string[], store?: string, total?: number }`
- `GET /api/history?limit=50` — retorna histórico recente
- `GET /api/popular?limit=20` — itens mais frequentes
- `GET /api/recommendations?items=arroz,feijao&limit=10` — recomenda itens dados os itens atuais

## Como funciona a recomendação

O sistema percorre o histórico de compras, calcula:

- suporte(item) = frequência do item / total de compras
- suporte(x,y) = frequência de x e y juntos / total
- confiança x->y = suporte(x,y) / suporte(x)
- lift = confiança / suporte(y)

Para cada item candidato `y` que não está na sua lista atual, escolhemos a melhor regra `x -> y` onde `x` pertence à sua lista. Ordenamos por uma pontuação que mistura confiança e lift.

Se não houver dados suficientes, mostramos itens mais populares como fallback.

## Estrutura

- `server.js` — servidor Express e rotas de API
- `src/store.js` — persistência simples em arquivo JSON
- `src/recommender.js` — lógica de recomendação
- `public/index.html` — UI com Tailwind
- `public/app.js` — lógica do frontend
- `data/history.json` — criado automaticamente ao rodar o servidor

## Próximos passos (ideias)

- Autenticação por usuário (para separar históricos)
- Categorias e unidades por item
- Preços por item e análise de variação
- Sugestões sazonais (considerar datas)
- Exportação/Importação do histórico
>>>>>>> cc8907c (chore: inicializa projeto (Node+TS+Express, CRUD, Auth, UI Tailwind, IA básica))
