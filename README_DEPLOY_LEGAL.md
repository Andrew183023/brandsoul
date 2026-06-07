# BrandSoul Legal Deployment Contract

## 1. Visao Geral

Este contrato fixa a superficie publicada do BrandSoul Legal sem alterar o runtime amplo do repositorio.

- Backend juridico canônico: `backend/src/server.legal-beta.ts`
- Superficie canonica de cases: `backend/src/api/routes/entity.ts`
- Superficie legacy/internal de cases: `backend/src/modules/legalCases/caseRoutes.ts`
- Frontend juridico isolado: `brandsoul-frontend/src/main.legal.tsx`

Este deploy **nao remove** FlowMind, runtime institucional ou modulos experimentais.  
Ele apenas define qual superficie juridica deve ser buildada e publicada.

## 2. Backend

- Root directory: `backend`
- Install: `npm ci`
- Build: `npm run build:legal`
- Start: `npm run start:legal`
- Health check: `GET /health`

Entrypoint publicado:

- `dist/server.legal-beta.js`

## 3. Frontend

- Root directory: `brandsoul-frontend`
- Install: `npm ci`
- Build: `npm run build:legal`
- Preview local: `npm run preview:legal`
- Publish dir: `dist-legal`

Entrypoint publicado:

- `index.legal.html`
- `src/main.legal.tsx`
- `vite.config.legal.ts`

## 4. Env Minima

Copie `.env.legal.example` para o ambiente do deploy e preencha:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL` ou `SQLITE_FILE`
- `ASSET_STORAGE_DIR`
- `JWT_SECRET` ou `AUTH_PRIVATE_KEY_REF` + `AUTH_PUBLIC_KEY_PATH`
- `AUTH_ISSUER`
- `AUTH_AUDIENCE`
- `AUTH_ACTIVE_KID`
- `CORS_ORIGIN`
- `VITE_API_URL`
- `VITE_AUTH_API_URL`
- `LEGAL_MARKETPLACE_ENTITY_ID` se o runtime legal continuar dependendo da entidade marketplace

## 5. Subida Local / Staging

Backend:

```bash
cd backend
npm ci
npm run build:legal
npm run start:legal
```

Frontend:

```bash
cd brandsoul-frontend
npm ci
npm run build:legal
npm run preview:legal
```

## 6. Staging Checklist

- backend usando root `backend`
- frontend usando root `brandsoul-frontend`
- backend build command = `npm ci && npm run build:legal`
- backend start command = `npm run start:legal`
- backend health check = `/health`
- frontend build command = `npm ci && npm run build:legal`
- frontend publish dir = `dist`
- `CORS_ORIGIN` aponta para a URL publica do frontend juridico
- `VITE_API_URL` e `VITE_AUTH_API_URL` apontam para a URL publica do backend juridico
- chaves auth reais presentes ou `JWT_SECRET` configurado para ambiente sem RSA

## 7. Smoke Test Manual

Backend:

- `GET /health`
- `POST /auth/register`
- `POST /auth/login`
- `GET /discover`
- `GET /escritorios/:id/publico`
- `POST /public/escritorios/:id/triagem`
- `GET /client/portal/:caseId/:token`

Frontend:

- `/`
- `/buscar`
- `/transparencia`
- `/escritorios/:officeId`
- `/portal/:caseId/:token`
- `/admin`
- `/admin/escritorios/:officeId/visao-geral`
- `/admin/escritorios/:officeId/casos`

Contrato automatizado:

- na raiz do repositorio: `npm run smoke:legal`

## 8. O Que Nao Faz Parte Deste Deploy

- runtime experimental/institucional como superficie publicada
- `caseRoutes.ts` como superficie publica de cases
- remocao de FlowMind, governance ou modulos experimentais
- deploy do backend legado em `brandsoul/`

Contrato final:

- cases publicados = `entity.ts`
- `caseRoutes.ts` = legacy/internal
