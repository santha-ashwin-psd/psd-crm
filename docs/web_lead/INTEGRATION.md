# Website → CRM: sending inquiries

For the PHP developer of **ieagents.co.in**. When a visitor submits a form, your
backend checks the captcha and then sends one HTTPS request to the CRM. The CRM
saves the person as a Contact and creates a **Pipeline** (sales opportunity) for
them.

> **Never put the API key in frontend JavaScript or HTML.** It must only exist on
> your server. The flow is: browser → your PHP backend (captcha check) → CRM.
> The CRM endpoint sends no CORS headers, so browsers cannot call it directly.

---

## 1. Endpoint

| | |
|---|---|
| **URL** | `https://crm.ieagents.co.in/api/method/xbr_crm.api.web_lead.capture_inquiry` |
| **Method** | `POST` |
| **Headers** | `Content-Type: application/json`<br>`X-Lead-Api-Key: <your key>` |
| **Body** | JSON (form-encoded `application/x-www-form-urlencoded` also works) |
| **Rate limit** | 30 requests per minute per server IP |

The API key is shared with you privately. Keep it in an environment variable,
not in code or in the repository. If your server has a fixed outbound IP, tell
us and we will lock the key to it.

---

## 2. Fields

| Field | Required | Notes |
|---|---|---|
| `first_name` | **yes** | |
| `mobile_no` | **yes** | Indian mobile, any format (`98765 43210`, `+91-98765-43210`, `09876543210`). Must be 10 digits starting 6–9. |
| `last_name` | no | |
| `email` | no | Validated **if sent**. Send `""` or leave it out if the form has none. |
| `city` | no | |
| `form_type` | no | `consultation`, `evaluation` or `contact` |
| `highest_qualification` | no | evaluation form |
| `course_level` | no | evaluation form |
| `preferred_state` | no | evaluation form |
| `start_timeline` | no | evaluation form |
| `page_url` | no | page the form was submitted from |

- Send values as typed — names, emails and mobiles are cleaned up on our side.
- Each value may be up to 140 characters (a longer `page_url` is shortened, not rejected).
- Any other field is ignored.

### Book Free Consultation

```json
{
  "form_type": "consultation",
  "first_name": "Arun",
  "last_name": "Kumar",
  "email": "arun.kumar@example.com",
  "mobile_no": "98765 43210",
  "city": "Chennai",
  "page_url": "https://ieagents.co.in/"
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
  "start_timeline": "Feb 2027 Intake",
  "page_url": "https://ieagents.co.in/evaluation"
}
```

### Contact page

```json
{
  "form_type": "contact",
  "first_name": "Rahul",
  "mobile_no": "9876512345",
  "city": "Madurai",
  "page_url": "https://ieagents.co.in/contact"
}
```

---

## 3. Responses

The CRM wraps every response in `{"message": …}` — read `message`.

**New inquiry — HTTP 200**

```json
{ "message": { "success": true, "pipeline": "PIPE-2026-00123", "contact": "Arun Kumar", "duplicate": false, "message": "Pipeline created." } }
```

**Same person again — HTTP 200**

```json
{ "message": { "success": true, "pipeline": "PIPE-2026-00098", "contact": "Arun Kumar", "duplicate": true, "message": "Inquiry recorded on the existing pipeline." } }
```

`duplicate: true` is a **success**. The person is already being followed up, so
the new answers are added to their existing pipeline instead of creating a
second one. Show the visitor the normal thank-you message.

Re-sending the exact same submission within 10 minutes (for example after a
timeout) is safe: you get the same answer back and nothing is created twice.

**Errors** — `success` is `false` and `code` says why:

```json
{ "message": { "success": false, "pipeline": null, "contact": null, "duplicate": false, "message": "First name is required", "code": "missing_first_name" } }
```

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | `missing_first_name` | `first_name` empty or missing |
| 400 | `invalid_mobile` | not a valid 10-digit Indian mobile |
| 400 | `invalid_email` | email sent but not a valid address |
| 400 | `field_too_long` / `invalid_field` | a value is over 140 characters, or not text |
| 401 | `invalid_api_key` | `X-Lead-Api-Key` missing or wrong |
| 403 | `ip_not_allowed` | your server's IP is not on the key's allowlist |
| 429 | — | more than 30 requests in a minute |
| 500 | `internal_error` | problem on our side; the submission was saved for us to recover |

---

## 4. PHP

Call this **after** your captcha check passes. It never throws, and it never
changes what the visitor sees: they always get your thank-you message, and any
failure is logged on your server so nothing is lost silently.

```php
<?php
/**
 * Send a validated inquiry to the CRM.
 * Returns ['ok' => bool, 'status' => int, 'body' => array|null].
 */
function sendInquiryToCrm(array $fields): array
{
    $url    = 'https://crm.ieagents.co.in/api/method/xbr_crm.api.web_lead.capture_inquiry';
    $apiKey = getenv('CRM_API_KEY'); // set on the server, never in code

    if (!$apiKey) {
        error_log('CRM: CRM_API_KEY is not set; inquiry not sent: ' . json_encode($fields));
        return ['ok' => false, 'status' => 0, 'body' => null];
    }

    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5,   // seconds to connect
        CURLOPT_TIMEOUT        => 10,  // seconds for the whole request
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'X-Lead-Api-Key: ' . $apiKey,
        ],
        CURLOPT_POSTFIELDS     => json_encode($fields),
    ]);

    $raw    = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error  = curl_error($ch);
    curl_close($ch);

    if ($raw === false) {
        // Timeout or network failure: the CRM never received it. Keep a copy.
        error_log('CRM: request failed (' . $error . '): ' . json_encode($fields));
        return ['ok' => false, 'status' => 0, 'body' => null];
    }

    $decoded = json_decode($raw, true);
    $body    = $decoded['message'] ?? null;
    $ok      = $status === 200 && !empty($body['success']);

    if (!$ok) {
        error_log('CRM: rejected (HTTP ' . $status . '): ' . $raw . ' for ' . json_encode($fields));
    }
    return ['ok' => $ok, 'status' => $status, 'body' => $body];
}

// ---- in your form handler, after the captcha check passes ----

sendInquiryToCrm([
    'form_type'             => 'evaluation',                  // or consultation / contact
    'first_name'            => trim($_POST['first_name'] ?? ''),
    'last_name'             => trim($_POST['last_name'] ?? ''),
    'email'                 => trim($_POST['email'] ?? ''),
    'mobile_no'             => trim($_POST['mobile_no'] ?? ''),
    'city'                  => trim($_POST['city'] ?? ''),
    'highest_qualification' => trim($_POST['highest_qualification'] ?? ''),
    'course_level'          => trim($_POST['course_level'] ?? ''),
    'preferred_state'       => trim($_POST['preferred_state'] ?? ''),
    'start_timeline'        => trim($_POST['start_timeline'] ?? ''),
    'page_url'              => $_SERVER['HTTP_REFERER'] ?? '',
]);

// Whatever the CRM answered, the visitor sees the normal message.
echo 'Thank you! Our team will contact you shortly.';
```

Validate `first_name` and the mobile number in your own form too, so visitors get
an immediate message instead of a silent `400` in your log.

---

## 5. Test with curl

Replace the key. Use `http://localhost:8002` instead of the production host to
test against a development copy of the CRM.

```bash
# New inquiry -> 200, duplicate: false
curl -i -X POST 'https://crm.ieagents.co.in/api/method/xbr_crm.api.web_lead.capture_inquiry' \
  -H 'Content-Type: application/json' \
  -H 'X-Lead-Api-Key: YOUR_API_KEY' \
  -d '{"form_type":"consultation","first_name":"Arun","last_name":"Kumar","email":"arun.kumar@example.com","mobile_no":"98765 43210","city":"Chennai"}'

# Same person, another form -> 200, duplicate: true
curl -i -X POST 'https://crm.ieagents.co.in/api/method/xbr_crm.api.web_lead.capture_inquiry' \
  -H 'Content-Type: application/json' \
  -H 'X-Lead-Api-Key: YOUR_API_KEY' \
  -d '{"form_type":"contact","first_name":"Arun","mobile_no":"9876543210"}'

# Missing first_name -> 400 missing_first_name
curl -i -X POST 'https://crm.ieagents.co.in/api/method/xbr_crm.api.web_lead.capture_inquiry' \
  -H 'Content-Type: application/json' \
  -H 'X-Lead-Api-Key: YOUR_API_KEY' \
  -d '{"mobile_no":"9876543210"}'

# Wrong key -> 401 invalid_api_key
curl -i -X POST 'https://crm.ieagents.co.in/api/method/xbr_crm.api.web_lead.capture_inquiry' \
  -H 'Content-Type: application/json' \
  -H 'X-Lead-Api-Key: wrong-key' \
  -d '{"first_name":"Test","mobile_no":"9876543210"}'
```

---

## 6. For the CRM administrator

Run on the CRM server (`<site>` is the production site name). Keys are generated
for you and printed **once** — store the key safely and send it privately, never
in the same message as this document.

```bash
# Create the key (optionally lock it to the website server's IP)
bench --site <site> execute xbr_crm.api.web_lead.create_key \
  --kwargs "{'company': 'IEA Seek International', 'label': 'ieagents.co.in website', 'allowed_ips': '203.0.113.10'}"

bench --site <site> execute xbr_crm.api.web_lead.list_keys
bench --site <site> execute xbr_crm.api.web_lead.rotate_key --kwargs "{'label': 'ieagents.co.in website'}"
bench --site <site> execute xbr_crm.api.web_lead.deactivate_key --kwargs "{'label': 'ieagents.co.in website'}"
```

- **Rotate** if the key leaks: the old key stops working immediately, so send the
  new one to the developer straight away.
- **Allowed IPs** can also be edited on the **CRM Web Lead Key** record (one IP or
  range per line). The check uses the address nginx passes in `X-Forwarded-For`;
  Frappe's standard nginx config sets it to the real client address.
- Every request — accepted or rejected — is recorded in **CRM Web Lead Log** with
  its payload (never the key), so a failed submission can be recovered.
- Callers set up before the CRM was renamed may still use
  `…/api/method/crm.api.web_lead.capture_inquiry`; it behaves identically.
- End-to-end check against a dev site: `python3 scripts/test_web_lead.py --key KEY`.
