# Frame Pricing — Backend Implementation Spec

## Overview

This spec covers everything needed to make the frame add-on flow fully operational end-to-end. The frontend already handles frame selection, price display, and passes `framePriceId` to `/api/checkout`. Two things need wiring up on the backend:

1. **Stripe setup** — three frame products/prices to create in the Stripe dashboard
2. **`/api/products`** — return a `framePrices` map so the frontend shows live Stripe prices
3. **`/api/checkout`** — create a second Stripe line item when a cart item includes a frame

---

## 1. Stripe Dashboard Setup

Create three separate Stripe Products — one per sculpture size. Frame products live independently in Stripe (not as variants of the sculpture products), which keeps revenue reporting clean.

### Products to create

| Stripe Product Name   | Metadata key `frameFor` | Price (GBP) | Price nickname       |
|-----------------------|-------------------------|-------------|----------------------|
| Frame — Small         | `neighbourhood`         | £7.00       | `frame_small`        |
| Frame — A4            | `portrait`              | £10.00      | `frame_a4`           |
| Frame — Large         | `quarter`               | £13.00      | `frame_large`        |

### Required metadata on each frame product

```
type     = frame
frameFor = <sculpture product ID>   (e.g. neighbourhood, portrait, quarter)
```

`type = frame` is the discriminator the backend uses to separate frame products from sculpture products during the `/api/products` fetch. `frameFor` is the key that links a frame price to its sculpture.

### Price configuration

- **Currency**: GBP
- **Billing**: one-time (not recurring)
- **Unit amount**: as above (700, 1000, 1300 pence)
- The Price object needs no extra metadata — only the Product does

---

## 2. `/api/products` — Return `framePrices`

### Current response shape

```json
{
  "products": [ ... ],
  "customSizePricePerSqm": 1500
}
```

### Required response shape

```json
{
  "products": [ ... ],
  "customSizePricePerSqm": 1500,
  "framePrices": {
    "neighbourhood": { "priceId": "price_abc123", "unitAmount": 700 },
    "portrait":      { "priceId": "price_def456", "unitAmount": 1000 },
    "quarter":       { "priceId": "price_ghi789", "unitAmount": 1300 }
  }
}
```

### Implementation

When fetching products from Stripe, include frame products in the same call and separate them by `metadata.type`.

```js
// Fetch all active products, expanding their default prices
const stripeProducts = await stripe.products.list({
  active: true,
  expand: ['data.default_price'],
  limit: 100,
});

const sculptureProducts = [];
const framePrices = {};

for (const product of stripeProducts.data) {
  const price = product.default_price;

  // Skip products without a GBP price
  if (!price || price.currency !== 'gbp' || price.unit_amount == null) continue;

  if (product.metadata?.type === 'frame') {
    // Frame product — slot it into the framePrices map
    const frameFor = product.metadata?.frameFor;
    if (frameFor) {
      framePrices[frameFor] = {
        priceId: price.id,
        unitAmount: price.unit_amount, // pence
      };
    }
  } else {
    // Sculpture product — existing handling unchanged
    sculptureProducts.push(/* existing mapping */);
  }
}

return res.json({
  products: sculptureProducts,
  customSizePricePerSqm: /* existing value */,
  framePrices,
});
```

### Notes

- If no frame products exist in Stripe (e.g. during staging), `framePrices` is returned as an empty object `{}`. The frontend falls back to hardcoded prices and blocks checkout — this is intentional and safe.
- Frame products must have `active: true` in Stripe to appear. Toggle them off in the dashboard to disable the frame option without a code deploy.
- If a frame product's `frameFor` references a product ID not in `sculptureProducts` (e.g. a discontinued size), it is included in `framePrices` anyway — the frontend simply won't display it.

---

## 3. `/api/checkout` — Add Frame as a Second Line Item

### What the frontend sends

Each cart item already includes:

```json
{
  "priceId": "price_sculpture_xxx",
  "frame": true,
  "framePriceId": "price_frame_xxx",
  "frameUnitAmount": 700,
  ...
}
```

`frame` is `false` (or absent) when the user chose "No frame". `framePriceId` is only present when `frame === true`.

### Required behaviour

For each cart item where `frame === true` and `framePriceId` is a non-empty, non-fallback string, add a second Stripe line item for the frame alongside the sculpture.

```js
const lineItems = [];

for (const item of items) {
  // --- Existing sculpture line item ---
  if (item.priceId === 'custom') {
    // existing custom price_data handling (unchanged)
    lineItems.push({ price_data: { ... }, quantity: 1 });
  } else {
    lineItems.push({ price: item.priceId, quantity: 1 });
  }

  // --- Frame add-on line item ---
  if (
    item.frame === true &&
    typeof item.framePriceId === 'string' &&
    item.framePriceId.length > 0 &&
    !item.framePriceId.startsWith('fallback_')
  ) {
    lineItems.push({ price: item.framePriceId, quantity: 1 });
  }
}

const session = await stripe.checkout.sessions.create({
  mode: 'payment',
  line_items: lineItems,
  // ... rest unchanged
});
```

### Validation

Add the following guard before building line items. The frontend performs the same check, but server-side validation is required to prevent tampered requests reaching Stripe.

```js
for (const item of items) {
  if (item.frame === true) {
    if (
      typeof item.framePriceId !== 'string' ||
      item.framePriceId.startsWith('fallback_') ||
      item.framePriceId.length === 0
    ) {
      return res.status(400).json({
        error: 'Frame pricing is unavailable. Please reload and try again.',
      });
    }
  }
}
```

### Why not re-verify the frame price amount server-side?

The `framePriceId` is a live Stripe Price ID fetched from Stripe's own API. Stripe enforces the unit amount attached to that price at session creation time — the client cannot alter it. No additional server-side amount check is needed for frame line items (contrast with `custom` sized sculptures where price must be recalculated because it has no fixed Stripe price).

---

## 4. Checkout Session Metadata

Update the session metadata to record which items are framed, for fulfilment reference.

```js
metadata: {
  // existing fields...
  framed: items
    .map((item, i) => (item.frame ? String(i) : null))
    .filter(Boolean)
    .join(',') || 'none',
}
```

This records the indices of framed items (e.g. `"0,2"`) so the fulfilment team can see at a glance which sculptures in a multi-item order need a frame.

---

## 5. Unchanged Constraints

| Rule | Status |
|------|--------|
| Custom sizes never have frames | Enforced in frontend (`selectedProduct.id !== 'custom'` guard). No backend change needed — `frame` will always be `false` for custom items. |
| Shipping flat rate | Unchanged. Frame add-ons do not affect shipping. |
| `fallback_` price IDs block checkout | Frontend blocks before the API call. Backend validation above adds a second layer. |

---

## 6. Testing Checklist

Before going live, verify the following in Stripe test mode:

- [ ] Three frame Stripe Products exist, each with `type = frame` and correct `frameFor` metadata
- [ ] `GET /api/products` returns `framePrices` with all three size keys and real `price_` IDs
- [ ] Selecting "No frame" → checkout session has exactly 1 line item
- [ ] Selecting "Add frame" → checkout session has exactly 2 line items (sculpture + frame)
- [ ] Cart with two sculptures, one framed → session has 3 line items
- [ ] Tampered request with `framePriceId: "fallback_frame_small"` returns HTTP 400
- [ ] Disabling a frame product in Stripe → `framePrices` omits that key → frontend falls back and blocks checkout (no silent failure)
