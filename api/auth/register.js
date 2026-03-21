import { query } from '../../lib/db.js';
import { hashPassword, signToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { name, email, password, region } = req.body ?? {};

  if (!name || !email || !password)
    return res.status(400).json({ error: 'Wszystkie pola są wymagane' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Hasło musi mieć minimum 6 znaków' });

  try {
    const { rows: existing } = await query(
      'SELECT id FROM companies WHERE email = $1',
      [email.toLowerCase()]
    );
    if (existing.length)
      return res.status(400).json({ error: 'Ten email jest już zarejestrowany' });

    const passwordHash = await hashPassword(password);

    const { rows } = await query(
      `INSERT INTO companies (name, email, password_hash, region)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, region, subscription_status, trial_ends_at`,
      [name, email.toLowerCase(), passwordHash, region ?? 'Polska']
    );
    const company = rows[0];

    const token = await signToken({
      companyId: company.id,
      email: company.email,
      name: company.name,
    });

    return res.status(201).json({ token, company });
  } catch (err) {
    console.error('register error', err);
    return res.status(500).json({ error: 'Błąd serwera' });
  }
}
