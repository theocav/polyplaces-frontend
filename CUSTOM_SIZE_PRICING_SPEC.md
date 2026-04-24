# Custom Size Pricing — Backend Spec

## Background

Prior to this change, custom frame pricing was calculated entirely in the browser using
constants embedded in the JavaScript (`ratePerSqm`, `largeSurchargeGBP`). A user could
open DevTools, override `calculateCustomPrice`, and submit an arbitrarily low price to
checkout. This spec defines the server-side controls that close that hole.

---

## 1. New endpoint: `GET /api/custom-size-price`

Used by the frontend to display a price as the user adjusts dimensions. The browser no
longer calculates prices itself — it only displays what the server returns.

### Request

```
GET /api/custom-size-price?widthMm=200&heightMm=150
```

| Query param | Type    | Required | Constraints          |
|-------------|---------|----------|----------------------|
| `widthMm`   | integer | yes      | 100 – 330 (inclusive) |
| `heightMm`  | integer | yes      | 100 – 330 (inclusive) |

### Success response `200`

```json
{
  "unitAmount": 4500,
  "currency": "gbp",
  "breakdown": {
    "areaSqm": 0.03,
    "ratePerSqm": 150000,
    "largeSurchargeApplied": false,
    "largeSurchargeAmount": 500
  }
}
```

All monetary values are in **pence** (integer). `ratePerSqm` is also in pence.

| Field                              | Description                                              |
|------------------------------------|----------------------------------------------------------|
| `unitAmount`                       | Total price in pence                                     |
| `breakdown.areaSqm`                | Width × height in m²                                     |
| `breakdown.ratePerSqm`             | Configured rate in pence per m²                          |
| `breakdown.largeSurchargeApplied`  | `true` if either dimension exceeds the large threshold   |
| `breakdown.largeSurchargeAmount`   | Surcharge in pence (even if not applied)                 |

### Error responses

| Status | Body                                      | When                           |
|--------|-------------------------------------------|--------------------------------|
| `400`  | `{ "error": "widthMm out of range" }`     | Dimension < 100 or > 330       |
| `400`  | `{ "error": "heightMm out of range" }`    | Dimension < 100 or > 330       |
| `400`  | `{ "error": "Invalid dimensions" }`       | Non-integer or missing params  |

### Pricing formula

```
areaSqm      = (widthMm / 1000) * (heightMm / 1000)
baseAmount   = round(areaSqm * RATE_PER_SQM_PENCE)
surcharge    = (widthMm > LARGE_THRESHOLD_MM || heightMm > LARGE_THRESHOLD_MM)
                 ? LARGE_SURCHARGE_PENCE
                 : 0
unitAmount   = baseAmount + surcharge
```

Configuration values (store in environment / config, not hardcoded):

| Constant               | Suggested default | Description                                    |
|------------------------|-------------------|------------------------------------------------|
| `RATE_PER_SQM_PENCE`   | `150000`          | £1,500.00 per m² expressed in pence            |
| `LARGE_THRESHOLD_MM`   | `250`             | Either dimension above this triggers surcharge |
| `LARGE_SURCHARGE_PENCE`| `500`             | £5.00 expressed in pence                       |
| `MIN_SIZE_MM`          | `100`             | Minimum allowed dimension                      |
| `MAX_SIZE_MM`          | `330`             | Maximum allowed dimension                      |

---

## 2. Changes required to `POST /api/checkout`

This is the critical enforcement point. The frontend sends `priceId: "custom"` items with
`customWidthMm` and `customHeightMm`. The backend **must** recalculate the price from
those dimensions and **ignore** any price supplied by the client.

### Current item schema (sent by frontend)

```json
{
  "priceId": "custom",
  "customWidthMm": 200,
  "customHeightMm": 150,
  "name": "Custom",
  "displaySize": "200×150mm",
  "sizeCode": 600,
  "aspectRatio": 0.75,
  "bbox": { ... },
  "center": { ... },
  "rotation": 0,
  "zoom": 1,
  "location": "London, UK",
  "customLabel": "My Street"
}
```

### Required backend behaviour for custom items

1. Identify items where `priceId === "custom"`.
2. Validate `customWidthMm` and `customHeightMm` are integers within `[MIN_SIZE_MM, MAX_SIZE_MM]`.
   Reject the entire checkout request with `400` if invalid.
3. **Recalculate** `unitAmount` using the same formula as `GET /api/custom-size-price`.
   Never use a price value submitted by the client.
4. Create the Stripe line item using the server-computed `unitAmount` with
   `price_data` (ad-hoc pricing), not a stored Stripe price ID:

```json
{
  "price_data": {
    "currency": "gbp",
    "unit_amount": <server_computed_pence>,
    "product_data": {
      "name": "Custom Map Print",
      "description": "200×150mm custom size"
    }
  },
  "quantity": 1
}
```

### Rejection cases

| Condition                                         | HTTP status | Error message                        |
|---------------------------------------------------|-------------|--------------------------------------|
| `customWidthMm` or `customHeightMm` missing       | `400`       | `"Custom item missing dimensions"`   |
| Either dimension outside `[MIN, MAX]`             | `400`       | `"Custom size dimensions out of range"` |
| Either dimension is not an integer                | `400`       | `"Custom size dimensions must be integers"` |

---

## 3. Remove `customSizePricePerSqm` from `GET /api/products`

The `GET /api/products` response previously included a `customSizePricePerSqm` field
that the frontend used to seed its local calculation. This field is no longer consumed
by the frontend and should be removed from the response to avoid confusion.

---

## 4. CORS

`GET /api/custom-size-price` must be accessible from `https://polyplaces.co.uk` under
the same CORS policy as the existing `/api/products` endpoint.

---

## 5. Rate limiting

Recommend applying a rate limit to `GET /api/custom-size-price` (e.g. 60 req/min per
IP) to prevent enumeration of the pricing formula. The endpoint is intentionally simple
and fast, so low limits are fine.
