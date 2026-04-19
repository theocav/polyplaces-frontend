# Contact Form — Backend Spec

## Overview

A single endpoint that receives a contact form submission and forwards it to the Polyplaces inbox. No database required.

---

## Endpoint

```
POST /contact
Content-Type: application/json
```

### Request body

```json
{
  "name":    "Jane Smith",
  "email":   "jane@example.com",
  "subject": "general",
  "message": "Hello, I have a question about..."
}
```

| Field     | Type   | Required | Notes                                                          |
|-----------|--------|----------|----------------------------------------------------------------|
| `name`    | string | yes      | Max 200 chars                                                  |
| `email`   | string | yes      | Must be a valid email address                                  |
| `subject` | string | no       | One of: `general`, `commission`, `order`, `other`. Default: `general` |
| `message` | string | yes      | Max 5000 chars                                                 |

### Success response — `200 OK`

```json
{ "ok": true }
```

### Error response — `400 Bad Request`

```json
{ "error": "Missing required field: message" }
```

### Error response — `500 Internal Server Error`

```json
{ "error": "Failed to send message" }
```

---

## What the endpoint does

1. Validate the four fields (required + length checks).
2. Send a plain-text email to `contact@polyplaces.co.uk` with the contents.
3. Return `{ "ok": true }`.

---

## Email format

**To:** contact@polyplaces.co.uk  
**From:** `Polyplaces Contact <noreply@polyplaces.co.uk>` (or your transactional email sender)  
**Reply-To:** the submitted `email` value  
**Subject:** `[Contact] <subject label> — <name>`

**Body:**
```
Name:    Jane Smith
Email:   jane@example.com
Subject: General enquiry

Message:
Hello, I have a question about...
```

Setting Reply-To means you can reply directly from your inbox.

---

## CORS

Allow `https://polyplaces.co.uk` (and `http://localhost:*` for local dev).

---

## Rate limiting

50 requests per IP per hour is sufficient to prevent abuse without blocking real users.

---

## Email provider

Use any transactional email service (e.g. Resend, Postmark, SendGrid). No new third-party SDK is needed on the frontend — the frontend only calls `/contact`.

---

## No Stripe involvement

This endpoint has no interaction with Stripe. It is entirely separate from the order flow.
