import { withCompany } from '../../lib/db.js';
import { authenticate } from '../../lib/auth.js';

export default async function handler(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;
  const { companyId } = user;
  const { id } = req.query;

  // ── PUT /api/orders/:id ───────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { client_id, client_name, title, description, status, scheduled_date, value } =
      req.body ?? {};

    const order = await withCompany(companyId, async (db) => {
      const { rows } = await db.query(
        `UPDATE orders SET
           client_id      = COALESCE($1, client_id),
           client_name    = COALESCE($2, client_name),
           title          = COALESCE($3, title),
           description    = $4,
           status         = COALESCE($5, status),
           scheduled_date = $6,
           value          = $7
         WHERE id = $8
         RETURNING *`,
        [
          client_id ?? null,
          client_name ?? null,
          title ?? null,
          description ?? null,
          status ?? null,
          scheduled_date ?? null,
          value ?? null,
          id,
        ]
      );
      return rows[0];
    });

    if (!order) return res.status(404).json({ error: 'Nie znaleziono zlecenia' });
    return res.status(200).json(order);
  }

  // ── DELETE /api/orders/:id ────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    await withCompany(companyId, async (db) => {
      await db.query('DELETE FROM orders WHERE id = $1', [id]);
    });
    return res.status(204).end();
  }

  return res.status(405).end();
}
