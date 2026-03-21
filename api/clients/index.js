import { withCompany } from '../../lib/db.js';
import { authenticate } from '../../lib/auth.js';

export default async function handler(req, res) {
  const user = await authenticate(req, res);
  if (!user) return;
  const { companyId } = user;

  // ── GET /api/clients ─────────────────────────────────────────────────────
  if (req.method === 'GET') {
    const clients = await withCompany(companyId, async (db) => {
      const { rows } = await db.query(
        'SELECT * FROM clients ORDER BY created_at DESC'
      );
      return rows;
    });
    return res.status(200).json(clients);
  }

  // ── POST /api/clients ────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const { name, type, email, phone, city, address, system_kw, status, notes } =
      req.body ?? {};
    if (!name) return res.status(400).json({ error: 'Nazwa klienta jest wymagana' });

    const client = await withCompany(companyId, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO clients
           (company_id, name, type, email, phone, city, address, system_kw, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [
          companyId,
          name,
          type ?? 'dom',
          email ?? null,
          phone ?? null,
          city ?? null,
          address ?? null,
          system_kw ?? null,
          status ?? 'new',
          notes ?? null,
        ]
      );
      return rows[0];
    });
    return res.status(201).json(client);
  }

  return res.status(405).end();
}
