import { withCompany } from '../../lib/db.js';
import { authenticate } from '../../lib/auth.js';

export default async function handler(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;
  const { companyId } = user;
  const { id } = req.query;

  // ── PUT /api/clients/:id ──────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { name, type, email, phone, city, address, system_kw, status, notes } =
      req.body ?? {};

    const client = await withCompany(companyId, async (db) => {
      const { rows } = await db.query(
        `UPDATE clients SET
           name       = COALESCE($1, name),
           type       = COALESCE($2, type),
           email      = $3,
           phone      = $4,
           city       = $5,
           address    = $6,
           system_kw  = $7,
           status     = COALESCE($8, status),
           notes      = $9
         WHERE id = $10
         RETURNING *`,
        [
          name ?? null,
          type ?? null,
          email ?? null,
          phone ?? null,
          city ?? null,
          address ?? null,
          system_kw ?? null,
          status ?? null,
          notes ?? null,
          id,
        ]
      );
      return rows[0];
    });

    if (!client) return res.status(404).json({ error: 'Nie znaleziono klienta' });
    return res.status(200).json(client);
  }

  // ── DELETE /api/clients/:id ───────────────────────────────────────────────
  if (req.method === 'DELETE') {
    await withCompany(companyId, async (db) => {
      await db.query('DELETE FROM clients WHERE id = $1', [id]);
    });
    return res.status(204).end();
  }

  return res.status(405).end();
}
