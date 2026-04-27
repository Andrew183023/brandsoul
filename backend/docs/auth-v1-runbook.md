# Auth v1 Runbook

This runbook assumes the consolidated architecture remains unchanged:

- TypeScript is the only auth authority
- RS256 is the only official token path
- Python is only a resource server
- no legacy fallback is allowed during incident response

## Quick Triage

Look here first:

- `GET /health`
- `GET /health/auth` with authenticated token
- `GET /metrics?format=json` with authenticated token
- `GET /.well-known/jwks.json`

Check these signals first:

- active `kid`
- validation `kid` set
- `auth_login_failure_by_reason_total`
- `auth_refresh_failure_by_reason_total`
- `auth_token_validation_failed_by_reason_total`
- `auth_refresh_reuse_detected_total`
- `auth_refresh_sessions_active_total`
- `auth_refresh_sessions_revoked_total`
- recent auth events in `auth.recentEvents`

## Smoke Tests

Run these in order:

1. `GET /health`
2. `GET /.well-known/jwks.json`
3. `POST /auth/login`
4. `GET /auth/me` with the returned access token
5. `POST /auth/refresh` with the returned refresh token
6. `GET /health/auth`
7. `GET /metrics?format=json`

Go if:

- `/health` is `ok` or only degraded outside auth
- `/health/auth` reports an active `kid`
- JWKS returns `200`
- login works
- refresh works
- validation failures are not spiking

No-Go if:

- no active signing key
- JWKS is broken
- login or refresh success rate has collapsed
- `unknown_kid` or `invalid_issuer` spikes immediately after deploy

## Incidents

### Login failing in mass

Main signals:

- login success rate down
- `auth_login_failure_total` rising
- `auth_login_failure_by_reason_total` concentrated in one reason

Where to look:

- `/metrics`
- `/health/auth`
- recent `auth.login.failure`

Actions:

1. Check `auth_login_failure_by_reason_total`.
2. If failures are `invalid_credentials`, verify upstream user data and whether the rollout changed request handling unexpectedly.
3. If failures are `auth_not_configured` or `signing_key_unavailable`, restore signing key configuration immediately.
4. Confirm `/health/auth` shows an active `kid`.
5. Re-run login smoke test before continuing rollout.

### Refresh failing in mass

Main signals:

- refresh success rate down
- `auth_refresh_failure_total` rising
- frontend sessions re-authing or looping

Where to look:

- `/metrics`
- `/health/auth`
- recent `auth.refresh.failure` and `auth.refresh.reuse_detected`

Actions:

1. Check `auth_refresh_failure_by_reason_total`.
2. Separate `refresh_expired`, `session_revoked`, `refresh_reuse_detected`, and config/key failures.
3. Verify `auth_refresh_sessions_active_total` is not unexpectedly zero.
4. Smoke-test `login -> refresh`.
5. If failure started after deploy, pause rollout until refresh path is stable again.

### Reuse detection firing

Main signals:

- `auth_refresh_reuse_detected_total` increases
- recent `auth.refresh.reuse_detected` events

Where to look:

- `/metrics`
- `auth.recentEvents`
- affected tenant/user/session family in logs

Actions:

1. Confirm the increase is real and not a test artifact.
2. Identify the impacted user, tenant, and refresh family from recent auth events.
3. Check whether incidents cluster around one client, deployment, or tenant.
4. If scope is limited, use `logout-all` for the impacted account or tenant-level operational playbook.
5. If scope grows, halt rollout and treat as possible token replay/security incident.

### Unknown KID

Main signals:

- `auth_token_validation_failed_by_reason_total{reason="unknown_kid"}`
- downstream resource servers reject otherwise valid requests

Where to look:

- `/health/auth`
- `/.well-known/jwks.json`
- recent `auth.token.validation_failed`

Actions:

1. Confirm active `kid` in `/health/auth`.
2. Confirm the same `kid` appears in `/.well-known/jwks.json`.
3. Confirm previous validation key was not removed too early.
4. If incident started after rotation, restore previous validation key immediately.
5. Do not reintroduce HS256 or Python-side issuance as a workaround.

### JWKS unavailable

Main signals:

- `/.well-known/jwks.json` non-200
- `auth_jwks_failures_total` increases

Where to look:

- JWKS endpoint directly
- `/health/auth`
- recent `auth.jwks.failure`

Actions:

1. Call `/.well-known/jwks.json`.
2. Check active key state in `/health/auth`.
3. Verify configured public key path and active key record.
4. Restore public key availability before continuing rollout.
5. Re-run `auth/me` and Python protected-route smoke tests.

### 401 chain after deploy

Main signals:

- protected routes start returning `401` in multiple places
- validation failure reasons spike after deployment

Where to look:

- `metrics.endpoints[].statusCounts["401"]`
- `auth_token_validation_failed_by_reason_total`
- `/health/auth`
- `/.well-known/jwks.json`

Actions:

1. Check top validation reasons first.
2. Compare deployed issuer, audience, and active `kid` to expected values.
3. Verify `login`, `auth/me`, and `refresh` all pass.
4. If `unknown_kid` or `invalid_issuer` appears after key rollout, rollback key activation.
5. If only refresh fails, halt rollout and treat as session continuity regression.

## Key Rotation

### Safe Rotation

1. Generate a new RSA key pair.
2. Publish the new public key and private key ref in TypeScript authority config.
3. Activate the new `kid` for issuance.
4. Keep the previous key available for validation as `verifying`.
5. Verify:
   - `/health/auth` shows the new active `kid`
   - `/.well-known/jwks.json` exposes the active key and, during overlap, the previous validation key
   - `auth_token_issued_by_kid_total` starts increasing for the new `kid`
   - `auth_token_validation_failed_by_reason_total` does not spike
6. Retire the old key only after all tokens signed by it are safely expired.

### Rotation Go / No-Go

Go if:

- active `kid` matches planned rollout
- issuance moves to the new `kid`
- old key remains valid for verification during overlap
- no `unknown_kid` spike appears

No-Go if:

- active `kid` missing
- JWKS does not reflect the expected overlap state
- Python/resource-server validation starts failing

## Rollback

### If rotation breaks validation

1. Reactivate the previous `kid` for issuance.
2. Keep the broken new key out of issuance.
3. Keep the previous validation key published.
4. Re-check `/health/auth` and `/.well-known/jwks.json`.
5. Re-run `login -> auth/me -> refresh`.

### If JWKS fails

1. Restore the public key artifact or path.
2. Reconfirm active key state in `/health/auth`.
3. Validate `/.well-known/jwks.json`.
4. Verify Python protected routes again before resuming rollout.

### If frontend enters refresh loop

1. Check `auth_refresh_failure_by_reason_total`.
2. If `refresh_reuse_detected` or `session_revoked`, force re-authentication and scope the user impact.
3. If `auth_not_configured`, `signing_key_unavailable`, or validation errors are rising, halt rollout.
4. Do not change frontend session architecture as an incident shortcut.

## Not Covered Yet

- no automated rotation job or rotation UI
- no Grafana board provisioned in-repo
- no persisted cross-instance time-series store; current operational view is snapshot-based




# Oh impressionante infinito e ousado amor de Deus 