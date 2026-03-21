import { withCompany } from '../../lib/db.js';
import { authenticate } from '../../lib/auth.js';

export default async function handler(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;
  const { companyId } = user;

  // ── GET /api/orders ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const orders = await withCompany(companyId, async (db) => {
      const { rows } = await db.query(
        `SELECT o.*, c.name AS client_display_name, c.city AS client_city
         FROM orders o
         LEFT JOIN clients c ON o.client_id = c.id
         ORDER BY o.created_at DESC`
      );
      return rows;
    });
    return res.status(200).json(orders);
  }

  // ── POST /api/orders ─────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { client_id, client_name, title, description, status, scheduled_date, value } =
      req.body ?? {};
    if (!title) return res.status(400).json({ error: 'Tytuł zlecenia jest wymagany' });

    const order = await withCompany(companyId, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO orders
           (company_id, client_id, client_name, title, description, status, scheduled_date, value)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [
          companyId,
          client_id ?? null,
          client_name ?? null,
          title,
          description ?? null,
          status ?? 'new',
          scheduled_date ?? null,
          value ?? null,
        ]
      );
      return rows[0];
    });
    return res.status(201).json(order);
  }

  return res.status(405).end();
}
