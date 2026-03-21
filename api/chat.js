import { withCompany } from '../lib/db.js';
import { authenticate } from '../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const user = await authenticate(req, res);
  if (!user) return;
  const { companyId, name: companyName } = user;

  const { message, history = [] } = req.body ?? {};
  if (!message) return res.status(400).json({ error: 'Brak wiadomości' });

  // Pull live CRM context from DB (scoped by RLS)
  const ctx = await withCompany(companyId, async (db) => {
    const { rows: clients } = await db.query(
      `SELECT name, type, city, system_kw, status FROM clients ORDER BY created_at DESC LIMIT 30`
    );
    const { rows: orders } = await db.query(
      `SELECT o.title, o.status, o.value, o.scheduled_date,
              COALESCE(o.client_name, c.name) AS client_name
       FROM orders o LEFT JOIN clients c ON o.client_id = c.id
       ORDER BY o.created_at DESC LIMIT 30`
    );
    const { rows: [stats] } = await db.query(`
      SELECT
        COUNT(DISTINCT c.id)                                       AS total_clients,
        COUNT(DISTINCT o.id)                                       AS total_orders,
        COALESCE(SUM(o.value) FILTER (WHERE o.status != 'canceled'), 0) AS pipeline,
        COUNT(o.id) FILTER (WHERE o.status = 'in_progress')       AS in_progress,
        COUNT(o.id) FILTER (WHERE o.status = 'awaiting_osd')      AS awaiting_osd
      FROM clients c FULL OUTER JOIN orders o ON c.id = o.client_id
    `);
    return { clients, orders, stats };
  });

  const systemPrompt = `Jesteś AI asystentem CRM dla firmy fotowoltaicznej "${companyName}". Masz dostęp do aktualnych danych tej firmy.

STATYSTYKI:
- Klientów: ${ctx.stats.total_clients}, Zleceń: ${ctx.stats.total_orders}
- Pipeline: ${Number(ctx.stats.pipeline).toLocaleString('pl')} zł
- W realizacji: ${ctx.stats.in_progress}, Oczekuje OSD: ${ctx.stats.awaiting_osd}

KLIENCI (ostatnie ${ctx.clients.length}):
${ctx.clients.map(c => `• ${c.name} | ${c.type} | ${c.city ?? '—'} | ${c.system_kw ?? '?'} kWp | ${c.status}`).join('\n')}

ZLECENIA (ostatnie ${ctx.orders.length}):
${ctx.orders.map(o => `• ${o.title} [${o.client_name ?? '—'}] | ${o.status}${o.value ? ' | ' + Number(o.value).toLocaleString('pl') + ' zł' : ''}${o.scheduled_date ? ' | ' + new Date(o.scheduled_date).toLocaleDateString('pl') : ''}`).join('\n')}

Odpowiadaj zwięźle po polsku. Możesz analizować dane, sugerować działania, tworzyć podsumowania i raporty.`;

  // Build conversation history for multi-turn chat
  const messages = [
    ...history.slice(-10).map(({ role, content }) => ({ role, content })),
    { role: 'user', content: message },
  ];

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20240620',
        max_tokens: 1024,
        system: systemPrompt,
        messages,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? 'AI error');

    return res.status(200).json({ reply: data.content[0].text });
  } catch (err) {
    console.error('chat error', err);
    return res.status(500).json({ error: 'Błąd połączenia z AI' });
  }
}
