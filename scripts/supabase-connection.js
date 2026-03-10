/**
 * Conexão PostgreSQL ao Supabase (para scripts sem browser).
 * Ordem: SUPABASE_DB_POOLER_URL → Management API (SUPABASE_ACCESS_TOKEN) + região → direct → IPv6 → pooler por região.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const dns = require('dns').promises;
const https = require('https');

const POOLER_REGIONS = [
  'eu-west-1',
  'us-east-1',
  'eu-central-1',
  'ap-southeast-1',
  'us-west-1',
  'ap-northeast-1',
  'ap-south-1',
  'eu-west-2',
  'sa-east-1',
  'ca-central-1',
  'me-south-1',
  'af-south-1',
  'eu-north-1',
  'ap-southeast-2',
  'ap-northeast-2',
  'eu-west-3',
];

const sslOption = { rejectUnauthorized: false };

function parseDirectUrl(url) {
  const m = url && url.match(/^postgres(?:ql)?:\/\/([^:]+):([^@]+)@([^:\/]+):(\d+)\/(.+)$/);
  if (!m) return null;
  const [, user, passwordEnc, host, port, db] = m;
  const projectRef = host.startsWith('db.') && host.endsWith('.supabase.co')
    ? host.replace(/^db\.|\.supabase\.co$/g, '')
    : null;
  return {
    user,
    passwordEnc,
    password: decodeURIComponent(passwordEnc),
    host,
    port: parseInt(port, 10),
    database: db.split('?')[0],
    projectRef,
  };
}

function fetchProjectRegion(projectRef, accessToken) {
  return new Promise((resolve) => {
    const req = https.get(
      `https://api.supabase.com/v1/projects/${projectRef}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve(data.region || null);
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
  });
}

/**
 * Obtém um cliente PostgreSQL conectado ao Supabase.
 * @returns {Promise<{ client: import('pg').Client, method: string } | { error: string }>}
 */
async function connect() {
  const pg = require('pg');
  const poolerUrl = (process.env.SUPABASE_DB_POOLER_URL || '').trim();
  const directUrl = process.env.SUPABASE_DB_URL;
  const accessToken = (process.env.SUPABASE_ACCESS_TOKEN || process.env.SUPABASE_PAT || '').trim();

  if (!poolerUrl && !directUrl) {
    return { error: 'Defina SUPABASE_DB_POOLER_URL ou SUPABASE_DB_URL no .env' };
  }

  let client = null;
  let lastError = null;
  let method = '';

  // 1) Pooler URL
  if (poolerUrl) {
    try {
      client = new pg.Client({ connectionString: poolerUrl, ssl: sslOption });
      await client.connect();
      method = 'SUPABASE_DB_POOLER_URL';
    } catch (e) {
      lastError = e;
    }
  }

  // 2) Management API + região
  if (!client && accessToken && directUrl) {
    const parsed = parseDirectUrl(directUrl);
    if (parsed?.projectRef) {
      const region = await fetchProjectRegion(parsed.projectRef, accessToken);
      if (region) {
        for (const port of [5432, 6543]) {
          try {
            const url = `postgres://postgres.${parsed.projectRef}:${parsed.passwordEnc}@aws-0-${region}.pooler.supabase.com:${port}/postgres`;
            client = new pg.Client({ connectionString: url, ssl: sslOption });
            await client.connect();
            method = `Management API (região ${region})`;
            break;
          } catch (e) {
            lastError = e;
            client = null;
          }
          if (client) break;
        }
      }
    }
  }

  // 3) Direct + SSL
  if (!client && directUrl) {
    const parsed = parseDirectUrl(directUrl);
    if (parsed?.host?.includes('supabase.co')) {
      for (const port of [5432, 6543]) {
        try {
          const url = directUrl.replace(/:(\d+)\//, `:${port}/`);
          client = new pg.Client({ connectionString: url, ssl: sslOption });
          await client.connect();
          method = `Direct :${port}`;
          break;
        } catch (e) {
          lastError = e;
          client = null;
        }
        if (client) break;
      }
    }
  }

  // 4) IPv6
  if (!client && directUrl) {
    const parsed = parseDirectUrl(directUrl);
    if (parsed?.host?.startsWith('db.') && parsed?.host?.endsWith('.supabase.co')) {
      try {
        const addrs = await dns.resolve6(parsed.host);
        if (addrs?.[0]) {
          for (const port of [5432, 6543]) {
            try {
              client = new pg.Client({
                host: addrs[0],
                port,
                user: parsed.user,
                password: parsed.password,
                database: parsed.database,
                ssl: sslOption,
              });
              await client.connect();
              method = `IPv6 :${port}`;
              break;
            } catch (e) {
              lastError = e;
              client = null;
            }
            if (client) break;
          }
        }
      } catch (_) {}
    }
  }

  // 5) Pooler por região
  if (!client && directUrl) {
    const parsed = parseDirectUrl(directUrl);
    if (parsed?.projectRef) {
      for (const region of POOLER_REGIONS) {
        for (const port of [5432, 6543]) {
          try {
            const url = `postgres://postgres.${parsed.projectRef}:${parsed.passwordEnc}@aws-0-${region}.pooler.supabase.com:${port}/postgres`;
            client = new pg.Client({ connectionString: url, ssl: sslOption });
            await client.connect();
            method = `Pooler ${region}:${port}`;
            break;
          } catch (e) {
            lastError = e;
            client = null;
          }
          if (client) break;
        }
        if (client) break;
      }
    }
  }

  if (!client) {
    const hint =
      lastError?.message === 'Tenant or user not found'
        ? 'O pooler não reconheceu o projeto. Defina SUPABASE_DB_POOLER_URL no .env (Dashboard → Connect → Session pooler → copiar URI).'
        : !accessToken && directUrl
          ? 'Adicione SUPABASE_ACCESS_TOKEN no .env (criar em https://supabase.com/dashboard/account/tokens) para tentar conexão automática.'
          : 'Use SUPABASE_DB_POOLER_URL (Session pooler do Dashboard → Connect) ou SUPABASE_ACCESS_TOKEN.';
    return {
      error: lastError?.message || 'Não foi possível ligar ao Supabase',
      hint,
    };
  }

  return { client, method };
}

module.exports = { connect, parseDirectUrl, fetchProjectRegion };
