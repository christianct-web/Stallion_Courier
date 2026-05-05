# Declaration ACE Frontend (Lovable)

React/Vite UI for the ACE Replacement MVP.

## Local run

```sh
npm i
npm run dev
```

## Backend connection (Phase 2)

This frontend now calls the ASYCUDA FastAPI service for real validation/export:

- `POST /validate`
- `POST /export-xml`

Set backend URL in `.env`:

```sh
VITE_ASYCUDA_SERVICE_URL=http://127.0.0.1:8000
```

If backend is unavailable, validate falls back to local client validation.
Export requires backend.

## Stack

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
