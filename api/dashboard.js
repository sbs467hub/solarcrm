import { withCompany } from '../lib/db.js';
import { authenticate } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  const user = await authenticate(req, res);
  if (!user) return;
  const { companyId } = user;

  const data = await withCompany(companyId, async (db) => {
    const { rows: [stats] } = await db.query(`
      SELECT
        (SELECT COUNT(*)                          FROM clients)                                      AS total_clients,
        (SELECT COUNT(*)                          FROM clients WHERE status = 'active')              AS active_clients,
        (SELECT COUNT(*)                          FROM orders)                                       AS total_orders,
        (SELECT COUNT(*)                          FROM orders WHERE status NOT IN ('done','canceled')) AS active_orders,
        (SELECT COUNT(*)                          FROM orders WHERE status = 'in_progress')          AS in_progress,
        (SELECT COUNT(*)                          FROM orders WHERE status = 'awaiting_osd')         AS awaiting_osd,
        (SELECT COALESCE(SUM(value),0)            FROM orders WHERE status NOT IN ('canceled'))      AS pipeline_value,
        (SELECT COALESCE(SUM(system_kw),0)        FROM clients WHERE status = 'active')             AS installed_kwp
    `);

    const { rows: recentClients } = await db.query(
      `SELECT id, name, type, city, system_kw, status, created_at
       FROM clients ORDER BY created_at DESC LIMIT 5`
    );

    const { rows: recentOrders } = await db.query(
      `SELECT o.id, o.title, o.status, o.value, o.scheduled_date,
              COALESCE(o.client_name, c.name) AS client_name
       FROM orders o LEFT JOIN clients c ON o.client_id = c.id
       ORDER BY o.created_at DESC LIMIT 5`
    );

    return { stats, recentClients, recentOrders };
  });

  return res.status(200).json(data);
}
