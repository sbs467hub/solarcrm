import { query } from '../../lib/db.js';
import { comparePassword, signToken } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { email, password } = req.body ?? {};
  if (!email || !password)
    return res.status(400).json({ error: 'Email i hasło są wymagane' });

  try {
    const { rows } = await query(
      `SELECT id, name, email, password_hash, region, subscription_status, trial_ends_at
       FROM companies WHERE email = $1`,
      [email.toLowerCase()]
    );
    const company = rows[0];

    if (!company)
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });

    const valid = await comparePassword(password, company.password_hash);
    if (!valid)
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });

    const token = await signToken({
      companyId: company.id,
      email: company.email,
      name: company.name,
    });

    return res.status(200).json({
      token,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        region: company.region,
        subscription_status: company.subscription_status,
        trial_ends_at: company.trial_ends_at,
      },
    });
  } catch (err) {
    console.error('login error', err);
    return res.status(500).json({ error: 'Błąd serwera' });
  }
}
