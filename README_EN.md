# CLI Proxy API Management Center (Technical Documentation)

[简体中文](README.md)

## 1. Scope

This repository contains the **frontend management UI** for CLI Proxy API.

- Stack: React 19 + TypeScript + Vite
- Output: a **single-file `management.html`**
- Purpose: manage config, auth files, quotas, logs, and usage through the backend **Management API**
- Out of scope: proxy forwarding, model routing, backend business logic

> In short: this is a **frontend admin panel repository**, not the backend proxy service.

---

## 2. Requirements

### 2.1 Backend

- CLI Proxy API is running
- Backend exposes `/management.html` and `/v0/management/*`
- Recommended backend version: `>= 6.8.15`

### 2.2 Frontend development

- Node.js `>= 20`
- npm `>= 10`

---

## 3. Local Development

```bash
npm ci
npm run dev
```

Default dev URL:

```text
http://localhost:5173
```

Open the page and connect it to your CLI Proxy API management endpoint.

---

## 4. Verification

```bash
npm test
npm run type-check
npm run build
```

- `npm test`: Vitest unit tests
- `npm run type-check`: TypeScript validation
- `npm run build`: single-file production build

---

## 5. Build Output

Run:

```bash
npm run build
```

Generated file:

```text
dist/index.html
```

The output is fully inlined and can be deployed as:

```text
management.html
```

inside the CLI Proxy API static directory.

---

## 6. Deployment

### 6.1 Replace static file directly

Copy the build artifact into the backend static directory:

```powershell
Copy-Item "dist/index.html" "<CLI_PROXY_API_ROOT>/static/management.html" -Force
```

For local Windows deployments, replacing `static/management.html` is usually enough.

### 6.2 Docker deployment

If the backend runs in Docker, recommended options are:

1. mount the static directory from the host
2. replace `management.html` in the mapped static path and restart the container

Example:

```powershell
npm run build
Copy-Item "dist/index.html" "<docker-mapped-static-dir>/management.html" -Force
docker restart <your-cli-proxy-api-container>
```

> If the static directory is bind-mounted, replacing the file is often enough.  
> Restarting the container is the safer option when you want to guarantee refresh.

---

## 7. Repository Layout

```text
src/
├─ components/        # shared and business components
├─ features/          # feature modules
├─ hooks/             # reusable hooks
├─ i18n/              # localization files
├─ pages/             # route pages
├─ services/api/      # frontend API wrappers
├─ stores/            # Zustand stores
├─ styles/            # global styles and variables
└─ utils/             # utilities
```

Key pages:

- `AuthFilesPage.tsx`: auth file management
- `QuotaPage.tsx`: quota management
- `UsagePage.tsx`: usage statistics
- `ConfigPage.tsx`: config management
- `LogsPage.tsx`: log management

---

## 8. Custom Enhancements in This Branch

This branch mainly maintains:

- Auth files
  - JSON / ZIP upload support
  - import / skipped / failed summary
  - persisted list state
  - expanded page size limit

- Quota management
  - config file search
  - custom page size
  - top-level manual refresh
  - auto refresh with editable interval
  - auto-delete on 401
  - auto-delete when weekly quota falls below threshold

- Usage statistics
  - preserved auto-refresh control panel
  - time-range filtering
  - export / import
  - charts and detail breakdowns

---

## 9. Branch Policy

- `main`
  - tracks upstream mainline
- `feat/usage-stats-autorefresh-dashboard`
  - maintains current custom enhancements

Recommended workflow:

- do daily work on the maintenance branch
- merge upstream updates first, then re-verify
- prefer **Chinese commit messages** for future changes

---

## 10. Troubleshooting

### 10.1 401 or connection failure

Check:

- management URL
- management key
- whether remote management is enabled on the backend

### 10.2 Build succeeded but UI did not change

Check:

- whether `dist/index.html` was copied as `management.html`
- whether the file was copied to the correct static directory
- whether Docker is still using an old mapped path
- whether the browser is serving cached content

### 10.3 Auth file upload failed

Check:

- file type is `json` or `zip`
- backend Management API supports the upload flow
- ZIP internal structure matches backend import expectations

---

## 11. License

MIT
