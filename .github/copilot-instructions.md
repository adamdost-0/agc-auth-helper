# Copilot instructions for agc-auth-helper

## Build and test commands

- Install dependencies: `npm install` for local work, `npm ci` in CI.
- Build/type-check: `npm run build` (`tsc -p tsconfig.json`).
- Run the app in development: `npm run dev` (`tsx watch src/index.ts`).
- Run compiled output: `npm start` after building.
- Run all tests: `npm test`.
- Run one test file: `npx tsx --test test/cloudProfile.test.ts`.
- Run one e2e test file: `npx tsx --test test/e2e/server.e2e.test.ts`.
- Run one named test: `npx tsx --test --test-name-pattern "Azure Government profile" test/cloudProfile.test.ts`.
- Validate cloud profiles: `npm run smoke-test -- --all`.
- Probe token acquisition for the selected cloud: `AUTH_MODE=azureCli npm run smoke-test -- --check-token`.

CI uses Node 20, `npm ci`, `npm run build`, `npx tsx --test test/cloudProfile.test.ts`, `find test/e2e -name '*.test.ts' | xargs npx tsx --test`, and `npx tsx scripts/smoke-test.ts --all`.

## High-level architecture

This is a minimal Node.js/TypeScript backend-for-frontend reference app for Azure sovereign, Azure Government Secret/Top Secret, Azure Stack Hub, and custom private clouds. The browser UI in `src/server/html.ts` only calls the local backend; Azure control-plane and data-plane calls stay server-side in `src/index.ts`.

Cloud-specific behavior is centralized in `src/config/cloudProfile.ts`. Built-in profiles cover `azure-commercial`, `azure-us-government`, `azure-us-gov-secret`, `azure-us-gov-topsecret`, and `azurestack-custom`; private/classified profiles contain placeholder endpoints and should be overridden with environment variables or `CUSTOM_CLOUD_PROFILE_PATH`. Profile validation normalizes URL fields, requires DNS suffixes to start with `.`, and turns audiences into OAuth scopes with `audienceToScope()`.

Authentication is planned by `src/auth/credentialFactory.ts`. `resolveAuthMode()` prefers explicit `AUTH_MODE`, then workload identity env vars, then managed identity host signals, then `azureCli`. `createCredentialPlan()` returns both the Azure credential and operator guidance. For non-public authority hosts, `shouldDisableInstanceDiscovery()` automatically sets `disableInstanceDiscovery: true` on credential types that need it; `ManagedIdentityCredential` and `AzureCliCredential` do not take the authority host directly.

Azure clients are intentionally thin wrappers over REST. `src/azure/http.ts` obtains a token for the profile audience, sets `Authorization`, defaults `Accept` to JSON, and throws with response details on non-2xx. `src/azure/armClient.ts` builds URLs from `resourceManagerEndpoint`; `src/azure/storageClient.ts` builds Blob URLs from `serviceDnsSuffixes.storage` and uses `serviceAudiences.storage`.

Runtime config comes from `src/config/appConfig.ts` and `.env.example`: `PORT`, `AZURE_CLOUD`, `AUTH_MODE`, optional `AZURE_SUBSCRIPTION_ID`, `AZURE_STORAGE_ACCOUNT`, `CUSTOM_CLOUD_PROFILE_PATH`, endpoint overrides, DNS suffix overrides, and audience overrides. Startup validates the selected cloud profile before serving.

Deployment assets are under `infra/` and docs are published from `docs/`. The documented deployment pattern is private ingress, managed identity, private endpoints, internal DNS, RBAC-only access, and no hardcoded classified-cloud endpoints.

## Key conventions

- Use ESM TypeScript with `moduleResolution: "NodeNext"` and include `.js` extensions in relative imports from `.ts` files.
- Keep endpoint, DNS suffix, and token audience decisions in cloud profiles or environment overrides; avoid scattering cloud-specific URLs through clients or UI code.
- Preserve the backend-for-frontend boundary: browser code should not receive Azure access tokens or call ARM/data-plane endpoints directly.
- When adding a new built-in cloud, update `supportedClouds`, `builtinProfiles`, profile docs/examples, smoke-test expectations, and tests that iterate over supported clouds.
- Cloud profile fields that are URLs should remain absolute and slash-normalized through `validateCloudProfile()`; service DNS suffixes must be appendable suffixes beginning with `.`.
- For custom/private authorities, rely on the credential factory's instance-discovery detection instead of manually branching in call sites.
- Tests use `node:test` and `node:assert/strict`. E2e tests use local mock ARM/Storage servers and `MockCredential`; avoid live Azure dependencies unless a test is explicitly Tier 3/live.
- `test/e2e/fixtures/testServer.ts` starts the app through `node_modules/.bin/tsx` and waits for the server's `listening` log line; route tests should clean up with `server.close()`.
- `scripts/smoke-test.ts` is for profile validation and optional real token probing, not for replacing the mocked e2e suite.
- If working on Squad-routed issues, read `.squad/team.md`, `.squad/routing.md`, any relevant `.squad/agents/{member}/charter.md`, and `.squad/decisions.md` before changing behavior.
- If working on an OpenSpec change, read the change's proposal/design/specs/tasks under `openspec/changes/`, keep implementation scoped to the tasks, and mark completed task checkboxes in the change's `tasks.md`.
