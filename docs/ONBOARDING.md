# Stallion Client Onboarding

## Architecture

**Multi-tenant approach:** Single deployment, API key based isolation.

---

## Client Data Model

### Supabase Tables

```sql
-- Clients table
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  subscription_tier TEXT DEFAULT 'starter',
  subscription_status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add client_id to declarations
ALTER TABLE declarations 
ADD COLUMN client_id UUID REFERENCES clients(id);

-- Add index for faster queries
CREATE INDEX idx_declarations_client ON declarations(client_id);
```

---

## API Key Management

### Generate API Key
```python
import secrets
api_key = f"stallion_{secrets.token_urlsafe(32)}"
# Example: stallion_K3n7xP9mR2...
```

### Authentication Flow
```python
# On every request
def authenticate(request):
    api_key = request.headers.get("X-API-Key")
    client = db.query("SELECT * FROM clients WHERE api_key = ?", api_key)
    if not client:
        raise HTTPException(401, "Invalid API key")
    return client  # Attach to request context
```

---

## Client Onboarding Flow

### 1. Sign Up (via frontend or email)
```
New Client → Request Sign Up → 
Admin reviews → Approve → 
Generate API Key → Send to client
```

### 2. Client Gets Access
- Receive API key via email
- Frontend URL + instructions
- API key stored in frontend

### 3. First Use
```
Open Frontend → Enter API Key → 
Workspaces loads client data → 
Create first declaration
```

---

## Frontend Implementation

### Store API Key
```javascript
// After client enters API key
localStorage.setItem('stallion_api_key', apiKey);
localStorage.setItem('stallion_client_id', clientId);
```

### Attach to Requests
```javascript
const headers = {
  'X-API-Key': localStorage.getItem('stallion_api_key'),
  'Content-Type': 'application/json'
};
```

### Client Switching
```javascript
// Settings page - switch client
function switchClient(newApiKey) {
  localStorage.setItem('stallion_api_key', newApiKey);
  // Refetch client data
  loadClientData();
}
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /auth/register | Request new client account |
| GET | /auth/verify | Verify API key works |
| GET | /auth/me | Get current client info |

---

## Security Considerations

1. **Never expose client_id in URLs** - Use headers only
2. **Rate limit per API key** - Prevent abuse
3. **Log API key usage** - For audit trail
4. **Rotate API keys** - Allow regeneration

---

## Pricing Tiers (Stored in DB)

| Tier | Declarations/mo | Features |
|------|-----------------|----------|
| Starter | 50 | Email support |
| Pro | 200 | Priority support, API |
| Enterprise | Unlimited | White-label, dedicated support |

---

## Implementation Steps

### Phase 1: Backend (Priority)
1. Add clients table to Supabase
2. Add client_id to declarations
3. Create /auth endpoints
4. Add API key auth middleware

### Phase 2: Frontend
1. Add API key input screen
2. Store key in localStorage
3. Add client info display
4. Add settings page

### Phase 3: Admin
1. Admin panel to create/manage clients
2. View all clients
3. Enable/disable clients
4. Generate new API keys

---

## Future Enhancements

- OAuth login for clients
- Team members per client
- Usage analytics dashboard
- Invoice/billing integration

## Status Update — 2026-02-23

- Added competitive dataset analysis and launch kit assets (`stallion/data`, `stallion/launch-kit`).
- Completed ACE→SADDEC comparison and profile-based validation workflow in `workspace/inbox_drive`.
- Transformer pipeline validated end-to-end (dummy enrichment test pass); production run pending broker-provided real values.
- Next execution: replace dummy values, run final transform, validate, and package submission-ready XML.
