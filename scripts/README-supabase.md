# Scripts Supabase (conexão sem browser)

Estes scripts ligam ao projeto Supabase por PostgreSQL e executam SQL **sem abrir o browser**.

## Variáveis no `.env`

- **`SUPABASE_DB_URL`** — Connection string direct (Dashboard → Connect → URI). Já costuma estar definida.
- **`SUPABASE_ACCESS_TOKEN`** — **Recomendado para conexão automática.** Personal Access Token da conta Supabase. O script usa a [Management API](https://supabase.com/docs/reference/api) para obter a região do projeto e ligar ao pooler correto.
  - Criar token: https://supabase.com/dashboard/account/tokens
  - Colar no `.env`: `SUPABASE_ACCESS_TOKEN=o_token_que_te_derem`
- **`SUPABASE_DB_POOLER_URL`** — Alternativa: Session pooler (Dashboard → Connect → "Session pooler"). Se estiver definida, é usada em primeiro lugar.

## Comandos

```bash
# Testar se a conexão funciona (SELECT 1)
npm run supabase:test-connection

# Aplicar o SQL de Financial Analytics (backfill + get_financial_report + get_financial_analytics)
npm run supabase:financial-analytics
```

## Se a conexão falhar

1. Adiciona **`SUPABASE_ACCESS_TOKEN`** no `.env` (criar em https://supabase.com/dashboard/account/tokens).
2. Mantém **`SUPABASE_DB_URL`** com a password da base de dados.
3. Volta a correr: `npm run supabase:test-connection`.

Se aparecer **"Tenant or user not found"** mesmo com o token definido, o pooler automático pode não reconhecer o teu projeto. Nesse caso:
- No Dashboard do projeto: **Connect** → **Session pooler** → copia a **URI**.
- Cola no `.env`: `SUPABASE_DB_POOLER_URL=postgres://postgres.[ref]:[password]@...`
- O script usa esta URL em primeiro lugar e a conexão passa a funcionar.

Depois disso, tanto o teste como o `supabase:financial-analytics` passam a funcionar sem browser.
