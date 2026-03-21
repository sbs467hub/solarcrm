import Stripe from 'stripe';
import { query } from '../../lib/db.js';
import { authenticate } from '../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const user = await authenticate(req, res);
  if (!user) return;

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  try {
    const { rows } = await query(
      'SELECT id, name, email, stripe_customer_id FROM companies WHERE id = $1',
      [user.companyId]
    );
    const company = rows[0];
    if (!company) return res.status(404).json({ error: 'Firma nie znaleziona' });

    // Create or reuse Stripe customer
    let customerId = company.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: company.email,
        name: company.name,
        metadata: { companyId: company.id },
      });
      customerId = customer.id;
      await query(
        'UPDATE companies SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, company.id]
      );
    }

    const appUrl = process.env.APP_URL ?? 'https://solarcrm-l1ef.vercel.app';

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${appUrl}?payment=success`,
      cancel_url: `${appUrl}?payment=canceled`,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('stripe checkout error', err);
    return res.status(500).json({ error: 'Błąd płatności' });
  }
}
