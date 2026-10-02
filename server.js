const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const cors = require('cors');

const app = express();
app.use(express.static('.'));
app.use(express.json());
app.use(cors());

// Rute pentru crearea sesiunii de plată Stripe
app.post('/create-checkout-session', async (req, res) => {
  const { plan } = req.body;
  
  let priceAmount = 4900; // 49 RON în bani (subunități)
  let planName = "Abonament Pro Creator";

  if (plan === 'business') {
    priceAmount = 14900; // 149 RON
    planName = "Abonament Business Enterprise";
  }

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'ron',
            product_data: { name: planName },
            unit_amount: priceAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: 'http://localhost:3000/?status=success',
      cancel_url: 'http://localhost:3000/?status=cancel',
    });

    res.json({ url: session.url });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serverul Nexus rulează pe portul ${PORT}`));
