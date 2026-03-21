import Stripe from 'stripe';
import { query } from '../../lib/db.js';

// Vercel: disable body parser so we get the raw buffer for signature verification
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return res.status(400).json({ error: 'Webhook signature invalid' });
  }

  const sub = event.data.object;

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await query(
        `UPDATE companies SET
           stripe_subscription_id = $1,
           subscription_status    = $2
         WHERE stripe_customer_id = $3`,
        [sub.id, sub.status === 'active' ? 'active' : sub.status, sub.customer]
      );
      break;

    case 'customer.subscription.deleted':
      await query(
        `UPDATE companies SET subscription_status = 'canceled'
         WHERE stripe_customer_id = $1`,
        [sub.customer]
      );
      break;

    case 'invoice.payment_failed':
      await query(
        `UPDATE companies SET subscription_status = 'past_due'
         WHERE stripe_customer_id = $1`,
        [sub.customer]
      );
      break;
  }

  return res.status(200).json({ received: true });
}
