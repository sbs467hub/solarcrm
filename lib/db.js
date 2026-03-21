import pg from 'pg';
const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 1, // important for serverless — avoid exhausting Neon connection limit
    });
  }
  return pool;
}

/**
 * Run fn(client) inside a transaction with RLS app.company_id set.
 * The SET LOCAL makes the variable transaction-scoped: it resets on COMMIT/ROLLBACK,
 * so even a reused pooled connection is safe.
 *
 * @param {string} companyId - UUID of the authenticated company
 * @param {(client: pg.PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withCompany(companyId, fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.company_id = $1', [companyId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Simple query without RLS context (used for companies table).
 */
export async function query(text, params) {
  return getPool().query(text, params);
}
