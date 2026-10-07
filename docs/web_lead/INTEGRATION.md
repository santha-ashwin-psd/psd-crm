# Website → CRM Lead Capture

How to post an inquiry form from **ieagents.co.in** into the CRM so it becomes a Lead.

This document is for the website developer. Everything the CRM side needs is already
in place — you only need to make one HTTPS call.

---

## 1. The one rule that matters

**The API key lives on your server. It must never appear in browser JavaScript, HTML,
or a public repo.**

The flow is:

```
visitor's browser  ──POST──>  your website backend  ──POST + API key──>  CRM
                               (validates the captcha here)
```

Not:

```
visitor's browser  ──POST + API key──>  CRM        ❌  the key is now public
```

This endpoint deliberately sends **no CORS headers**, so a browser cannot call it
directly. That is the enforcement of the rule above, not an oversight — do not ask
for CORS to be enabled.

---

## 2. Endpoint

| | |
|---|---|
| **URL** | `https://crm.psdigitise.com/api/method/xbr_crm.api.web_lead.capture_inquiry` |
| **Method** | `POST` |
| **Header** | `X-Lead-Api-Key: <the key you were given>` |
| **Body** | JSON (`Content-Type: application/json`) or form-encoded |
| **Rate limit** | 30 requests per minute, per source IP |

The key will be issued to you separately. It identifies *which company's CRM* the
lead belongs to, so it is specific to ieagents.co.in — do not reuse it elsewhere.

### Optional IP lock

Once you can tell us the **static outbound IP of your web server**, we will add it to
the key's allowlist and every request from anywhere else will be refused with `403`.
Send us that IP when you have it. Until then the key alone grants access.

---

## 3. Fields

Only `first_name` and `mobile_no` are required. Everything else is optional — send
what the form collected and omit the rest.

| Field | Required | Notes |
|---|---|---|
| `first_name` | **yes** | |
| `mobile_no` | **yes** | Indian mobile. Any format — `98765 43210`, `+91-98765-43210`, `09876543210` all work. Must be a real 10-digit number starting 6–9. |
| `email` | no | Must be a valid address **if you send it**. Omit or send `""` if the form has no email. |
| `last_name` | no | |
| `city` | no | "City You Are Calling From" |
| `form_type` | no | `consultation`, `evaluation`, or `contact`. Lets us report per form. A new value is accepted, not rejected. |
| `highest_qualification` | no | evaluation form |
| `course_level` | no | evaluation form |
| `preferred_state` | no | evaluation form |
| `start_timeline` | no | evaluation form |
| `page_url` | no | Page the form was submitted from |
| `utm_source` / `utm_medium` / `utm_campaign` | no | Pass through whatever is on the landing URL |

Names are title-cased, emails lower-cased and mobiles normalised to `+91XXXXXXXXXX`
on our side — send them as typed.

Any field not in this table is ignored. You cannot set the lead's status, owner or
company from the payload.

---

## 4. Payload examples

### Book Free Consultation

```json
{
  "form_type": "consultation",
  "first_name": "Arun",
  "last_name": "Kumar",
  "email": "arun.kumar@example.com",
  "mobile_no": "98765 43210",
  "city": "Chennai",
  "page_url": "https://ieagents.co.in/",
  "utm_source": "google",
  "utm_medium": "cpc",
  "utm_campaign": "study-abroad-2026"
}
```

### Start your free evaluation

```json
{
  "form_type": "evaluation",
  "first_name": "Divya",
  "last_name": "Sundaram",
  "email": "divya.s@example.com",
  "mobile_no": "+919876500001",
  "city": "Coimbatore",
  "highest_qualification": "Bachelors in Commerce",
  "course_level": "Masters",
  "preferred_state": "New South Wales",
  "start_timeline": "Feb 2027 Intake"
}
```

### Contact page

```json
{
  "form_type": "contact",
  "first_name": "Rahul",
  "mobile_no": "9876512345",
  "city": "Madurai"
}
```

---

## 5. Responses

The body is always wrapped by the framework in a `message` object:

```json
{ "message": { "success": true, "lead": "CRM-LEAD-2026-00123", "duplicate": false, "message": "Lead created." } }
```

Read `response.message`, not the top level.

### Lead created — `200`

```json
{ "success": true, "lead": "CRM-LEAD-2026-00123", "duplicate": false, "message": "Lead created." }
```

### Already known — `200`

```json
{ "success": true, "lead": "CRM-LEAD-2026-00098", "duplicate": true, "message": "Inquiry recorded on the existing lead." }
```

If someone who already enquired submits again — including through a *different* form —
we do not create a second lead. The new answers are attached as a note on the lead
that already exists. **`duplicate: true` is a success, not an error.** Show the visitor
the same thank-you message.

The same response covers a **retry**: if you re-send an identical submission (same
key + `form_type` + email/mobile) within **10 minutes**, you get the original lead
back and nothing is changed — not even an extra note. So a timeout on your side is
safe to retry blindly.

### Errors

Error bodies carry a stable `code` alongside the human `message`. Branch on `code`
— the `message` is translated and may be reworded.

| HTTP | `code` | `message` | What to do |
|---|---|---|---|
| `400` | `missing_first_name` | `First name is required` | Fix your form validation |
| `400` | `invalid_mobile` | `A valid 10-digit Indian mobile number is required` | Reject at your end too, with a friendlier message |
| `400` | `invalid_email` | `Email address is not valid` | Validate before sending, or omit the field |
| `401` | `invalid_api_key` | `Missing or invalid API key` | Header missing/wrong, or the key was deactivated |
| `403` | `ip_not_allowed` | `Requests from this IP address are not allowed` | Your server IP is not on the allowlist — tell us the new IP |
| `429` | — | rate limit message | You exceeded 30/min. Back off and retry. |
| `500` | `internal_error` | `Could not process the inquiry...` | Our side. The raw payload **is** saved and can be recovered — tell us. |

```json
{ "message": { "success": false, "lead": null, "duplicate": false, "message": "Email address is not valid", "code": "invalid_email" } }
```

**Never drop a submission because our endpoint failed.** Store it on your side and
retry, or at minimum email it to the team. A `500` means we kept the payload, but a
network timeout means nobody did.

---

## 6. Server-side examples

Both assume you have **already validated your image captcha** before this point.

### PHP

```php
<?php
/**
 * Forward a validated inquiry to the CRM.
 * Returns [httpStatus, decodedBody].
 */
function sendLeadToCrm(array $fields): array
{
    $endpoint = 'https://crm.psdigitise.com/api/method/xbr_crm.api.web_lead.capture_inquiry';
    // Keep the key in an env var or config file OUTSIDE the web root.
    $apiKey = getenv('CRM_LEAD_API_KEY');

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'X-Lead-Api-Key: ' . $apiKey,
        ],
        CURLOPT_POSTFIELDS     => json_encode($fields),
    ]);

    $raw    = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err    = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        // Network failure: the CRM never saw this. Persist it and retry later.
        error_log('CRM lead post failed: ' . $err);
        return [0, null];
    }

    $body = json_decode($raw, true);
    return [$status, $body['message'] ?? $body];
}

// --- usage, after your captcha check passes ---
[$status, $result] = sendLeadToCrm([
    'form_type'  => 'consultation',
    'first_name' => $_POST['first_name'],
    'last_name'  => $_POST['last_name'] ?? '',
    'email'      => $_POST['email'] ?? '',
    'mobile_no'  => $_POST['mobile_no'],
    'city'       => $_POST['city'] ?? '',
    'page_url'   => $_POST['page_url'] ?? '',
]);

if ($status === 200 && !empty($result['success'])) {
    // Covers both a new lead and a duplicate — both are a success for the visitor.
    echo json_encode(['ok' => true, 'message' => 'Thank you, we will call you shortly.']);
} else {
    error_log('CRM rejected lead: ' . $status . ' ' . json_encode($result));
    echo json_encode(['ok' => false, 'message' => 'Something went wrong. Please call us.']);
}
```

### Node.js (Express)

```js
// npm i express  — fetch is built in on Node 18+
const express = require('express')
const app = express()
app.use(express.json())

const CRM_ENDPOINT = 'https://crm.psdigitise.com/api/method/xbr_crm.api.web_lead.capture_inquiry'
const CRM_API_KEY = process.env.CRM_LEAD_API_KEY // never hardcode

async function sendLeadToCrm(fields) {
  const res = await fetch(CRM_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Lead-Api-Key': CRM_API_KEY,
    },
    body: JSON.stringify(fields),
    signal: AbortSignal.timeout(15000),
  })

  const raw = await res.text()
  let body
  try {
    body = JSON.parse(raw)
    body = body.message ?? body
  } catch {
    body = { message: raw }
  }
  return { status: res.status, body }
}

app.post('/api/inquiry', async (req, res) => {
  // 1. validate your image captcha FIRST
  if (!isCaptchaValid(req.body.captcha, req.session)) {
    return res.status(400).json({ ok: false, message: 'Captcha is incorrect.' })
  }

  const fields = {
    form_type: req.body.form_type || 'consultation',
    first_name: req.body.first_name,
    last_name: req.body.last_name,
    email: req.body.email,
    mobile_no: req.body.mobile_no,
    city: req.body.city,
    page_url: req.body.page_url,
    utm_source: req.body.utm_source,
  }

  try {
    const { status, body } = await sendLeadToCrm(fields)
    if (status === 200 && body.success) {
      // body.duplicate === true is still a success for the visitor
      return res.json({ ok: true, message: 'Thank you, we will call you shortly.' })
    }
    console.error('CRM rejected lead', status, body)
    return res.status(502).json({ ok: false, message: 'Something went wrong. Please call us.' })
  } catch (err) {
    // Timeout or network error: the CRM may never have seen this. Queue and retry.
    console.error('CRM unreachable', err)
    await queueForRetry(fields)
    return res.json({ ok: true, message: 'Thank you, we will call you shortly.' })
  }
})
```

---

## 7. Zapier setup

If the forms reach Zapier rather than your own backend, you do not need any server
code — a two-step Zap does the whole job.

### The Zap

| Step | What |
|---|---|
| **1. Trigger** | **Webhooks by Zapier → Catch Hook** (the form posts to Zapier's URL), or **Email Parser by Zapier** if the site only emails its form results |
| **2. Action** | **Webhooks by Zapier → POST** |

### Step 2 settings

| Field | Value |
|---|---|
| **URL** | `https://crm.psdigitise.com/api/method/xbr_crm.api.web_lead.capture_inquiry` |
| **Payload Type** | `Json` |
| **Wrap Request In Array** | **No** |
| **Unflatten** | **No** |
| **Headers** | `X-Lead-Api-Key` = your key |

Leave Basic Auth empty — the header is the whole authentication.

> **Use a separate key for Zapier.** Zapier's outbound IPs are not fixed and are not
> published as a stable list, so the Zapier key must have its **IP allowlist left
> empty**. Keep the website-backend key (which can be IP-locked) separate, so one
> does not force the other to be open. Ask us for a Zapier-specific key.

### Field mapping — Book Free Consultation

| Data field | Value |
|---|---|
| `form_type` | `consultation` |
| `first_name` | → first name from the trigger |
| `last_name` | → last name |
| `email` | → email |
| `mobile_no` | → mobile |
| `city` | → city |
| `page_url` | → page URL, if the trigger has one |

### Field mapping — Start your free evaluation

| Data field | Value |
|---|---|
| `form_type` | `evaluation` |
| `first_name`, `last_name`, `email`, `mobile_no`, `city` | as above |
| `highest_qualification` | → highest qualification |
| `course_level` | → course level |
| `preferred_state` | → preferred state |
| `start_timeline` | → start timeline |

### Field mapping — Contact page

| Data field | Value |
|---|---|
| `form_type` | `contact` |
| `first_name`, `mobile_no` | **required** |
| everything else | optional |

### Things you do not have to worry about

- **Blank fields.** Zapier sends `""` for anything unmapped. We treat an empty
  string as absent, so you can map every field on every Zap and leave the unused
  ones blank. The literal words `null`, `none`, `undefined` and `n/a` are treated
  the same way.
- **Extra fields.** Send whatever else the trigger produces — `zap_id`, raw bodies,
  timestamps. Anything we do not recognise is ignored, not rejected.
- **Retries.** Zapier re-sends a POST that timed out. An identical submission
  (same key + form type + email/mobile) within **10 minutes** returns the original
  lead with `duplicate: true` and changes nothing — no second lead, and no second
  note on the existing one. You do not need a dedupe step in the Zap.
- **Form encoding.** `Form` payload type works too if you prefer it to `Json`.

### Reading the result in Zap history

A successful task shows:

```json
{ "message": { "success": true, "lead": "CRM-LEAD-2026-00123", "duplicate": false, "message": "Lead created." } }
```

`duplicate: true` is **also** a success — that person had already enquired.

A failed task shows a `code` you can branch on with a Zapier **Filter** or route to
an alert:

| `code` | HTTP | Meaning |
|---|---|---|
| `missing_first_name` | 400 | the mapping is empty or wrong |
| `invalid_mobile` | 400 | not a valid 10-digit Indian mobile |
| `invalid_email` | 400 | mapped something that is not an address |
| `invalid_api_key` | 401 | header missing/wrong, or the key was deactivated |
| `ip_not_allowed` | 403 | this key is IP-locked and should not be — tell us |
| `internal_error` | 500 | our side; the payload is saved and recoverable |

The `code` is stable. The `message` text is translated and may be reworded, so do
not write Zap filters against it.

### If a Zap fails

Zapier keeps the task and lets you **Replay** it. Replaying inside the 10-minute
window is safe — it returns the original lead rather than creating another. Beyond
that window a replay is treated as a genuine new inquiry, which for an already-known
person means a note on their existing lead, still not a duplicate.

---

## 8. Quick test with curl

The examples below use `localhost:8001` so they work on a dev bench. For the live
server swap in `https://crm.psdigitise.com`. Replace the key either way.

**Consultation form:**

```bash
curl -i -X POST 'http://localhost:8001/api/method/xbr_crm.api.web_lead.capture_inquiry' \
  -H 'Content-Type: application/json' \
  -H 'X-Lead-Api-Key: YOUR_API_KEY' \
  -d '{
    "form_type": "consultation",
    "first_name": "Arun",
    "last_name": "Kumar",
    "email": "arun.kumar@example.com",
    "mobile_no": "98765 43210",
    "city": "Chennai",
    "page_url": "https://ieagents.co.in/"
  }'
```

**Evaluation form:**

```bash
curl -i -X POST 'http://localhost:8001/api/method/xbr_crm.api.web_lead.capture_inquiry' \
  -H 'Content-Type: application/json' \
  -H 'X-Lead-Api-Key: YOUR_API_KEY' \
  -d '{
    "form_type": "evaluation",
    "first_name": "Divya",
    "mobile_no": "+919876500001",
    "highest_qualification": "Bachelors in Commerce",
    "course_level": "Masters",
    "preferred_state": "New South Wales",
    "start_timeline": "Feb 2027 Intake"
  }'
```

**Form-encoded instead of JSON:**

```bash
curl -i -X POST 'http://localhost:8001/api/method/xbr_crm.api.web_lead.capture_inquiry' \
  -H 'X-Lead-Api-Key: YOUR_API_KEY' \
  --data-urlencode 'form_type=contact' \
  --data-urlencode 'first_name=Rahul' \
  --data-urlencode 'mobile_no=9876512345' \
  --data-urlencode 'city=Madurai'
```

**Confirm a bad key is refused (expect `401`):**

```bash
curl -i -X POST 'http://localhost:8001/api/method/xbr_crm.api.web_lead.capture_inquiry' \
  -H 'Content-Type: application/json' \
  -H 'X-Lead-Api-Key: wrong-key' \
  -d '{"first_name":"Test","mobile_no":"9876543210"}'
```

---

## 9. Browser simulator

`scripts/test_inquiry_form.html` is a standalone page with all five fields that posts
to the endpoint, for checking the CRM side before your backend is ready.

Serve it over http (not `file://`) because the endpoint sends no CORS headers:

```bash
cd apps/crm && python3 -m http.server 8080
# then open http://localhost:8080/scripts/test_inquiry_form.html
```

It asks for the API key in a form field — that is acceptable for local testing only,
and the page says so. Your production integration must keep the key server-side.

---

## 10. Managing API keys (CRM administrator)

> This section is for whoever runs the CRM, not the website developer. Skip it if
> you were given a key.

Keys are **generated, never chosen** — the `API Key` field is read-only in the desk
and a secret is minted with `secrets.token_urlsafe(32)` on creation. It is shown
**once**, then encrypted at rest and unreadable thereafter, including to you. If you
lose it, rotate; there is no recovery.

All commands run on the server. There is no HTTP endpoint for any of this on
purpose: a response containing a plaintext secret ends up in browser history, proxy
logs and the network tab.

### Create a key

```bash
bench --site crm.psdigitise.com execute xbr_crm.api.web_lead.create_key \
  --kwargs "{'company': 'IEA Seek International', 'label': 'ieagents.co.in website'}"
```

Optional kwargs: `website_url`, `lead_owner` (sets `default_lead_owner`).

Creates the `CRM Company` if it does not exist. Re-running with an existing label
**refuses** rather than silently rotating — a website already posting with that key
would start failing.

One key per caller. Give Zapier its own:

```bash
bench --site crm.psdigitise.com execute xbr_crm.api.web_lead.create_key \
  --kwargs "{'company': 'IEA Seek International', 'label': 'IEA Zapier'}"
```

### List keys

```bash
bench --site crm.psdigitise.com execute xbr_crm.api.web_lead.list_keys
```

```
KEY                               COMPANY                     ACTIVE  IPs             ROTATED
----------------------------------------------------------------------------------------------
IEA Agents Website                IEA Seek International      yes     any             never
IEA Zapier                        IEA Seek International      yes     any             never
```

### Rotate a key

```bash
bench --site crm.psdigitise.com execute xbr_crm.api.web_lead.rotate_key \
  --kwargs "{'label': 'ieagents.co.in website'}"
```

**The old secret dies the instant this commits.** There is no grace period and no
second active secret — two live secrets is the situation you are rotating to escape.

So the order matters:

- **Leaked key** → rotate immediately, then send the new one. Accept the gap.
- **Planned rotation** → tell the developer first, agree a window, rotate, then send
  the new value. Their submissions 401 until they deploy it.

Either way the inquiries are not lost silently: every rejected request is still
written to **CRM Web Lead Log** with its full payload, so anything that failed
during the gap can be recovered and re-entered.

`Last Rotated On` on the key records when it last happened.

### Deactivate / reactivate

```bash
bench --site crm.psdigitise.com execute xbr_crm.api.web_lead.deactivate_key \
  --kwargs "{'label': 'ieagents.co.in website'}"

bench --site crm.psdigitise.com execute xbr_crm.api.web_lead.activate_key \
  --kwargs "{'label': 'ieagents.co.in website'}"
```

Requests with a deactivated key get `401 invalid_api_key`. The secret is unchanged,
so reactivating restores service without redistributing anything.

**Prefer deactivating to deleting.** `CRM Web Lead Log` rows reference the key by
name; deleting it orphans the audit trail for every lead that key ever captured.

### Restricting by IP

New keys accept any source IP. Once you know the caller's static outbound address,
set **Allowed IPs** on the key (one IP or CIDR per line). Anything else then gets
`403 ip_not_allowed`. The field is validated when you save, so a typo fails there
rather than silently in production.

Leave it empty for Zapier — its egress IPs are not a fixed published list.

---

## 11. Troubleshooting on the CRM side

Every single request is recorded, including ones that failed validation. In the CRM
desk, open **CRM Web Lead Log**:

- `result` — `success`, `duplicate` or `error`
- `payload` — exactly what was posted, so a failed inquiry can be re-entered or replayed
- `message` — why it was rejected
- `client_ip` — useful when setting up the IP allowlist

The API key is never written to this log.
