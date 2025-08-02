// index.js
require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bodyParser = require('body-parser');
const app = express();
app.use(bodyParser.json());

// In‑memory store
const subscriptions = {};

// POST /api/create-subscription-session
app.post('/api/create-subscription-session', async (req, res) => {
  const { userId, amount_cents, currency, stripe_account_id } = req.body;
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency,
          product_data: { name: `Subscription for ${userId}` },
          unit_amount: amount_cents
        },
        quantity: 1
      }],
      payment_intent_data: {
        application_fee_amount: Math.floor(amount_cents * 0.20),
        transfer_data: {
          destination: stripe_account_id
        }
      },
      // test mode uses your test secret key
      success_url: `${req.protocol}://${req.get('host')}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.protocol}://${req.get('host')}/cancel`
    });
    res.json({ success: true, sessionId: session.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/webhook-stripe
app.post('/api/webhook-stripe', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).json({ success: false, error: 'Invalid signature' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    subscriptions[session.id] = { userId: session.client_reference_id || session.customer, session };
    return res.json({ success: true, message: 'Subscription activated' });
  } else if (event.type === 'payment_intent.payment_failed') {
    const intent = event.data.object;
    console.error('Payment failed:', intent.last_payment_error?.message);
    return res.json({ success: false, error: 'Payment failed' });
  } else {
    return res.json({ success: true, message: 'Event ignored' });
  }
});

// GET /api/vendor-sales-status?vendorId=...
app.get('/api/vendor-sales-status', (req, res) => {
  const { vendorId } = req.query;
  // mock static
  res.json({
    totalSubscriptions: 100,
    totalRevenueCents: 30000000,
    totalCommissionCents: 6000000
  });
});

// Optional routes for success/cancel pages
app.get('/success', (req, res) => res.send('Success! Session: ' + req.query.session_id));
app.get('/cancel', (req, res) => res.send('Payment canceled'));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server running on port ${port}`));