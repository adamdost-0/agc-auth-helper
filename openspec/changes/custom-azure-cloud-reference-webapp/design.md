## Context

This repository is being used to define a reference solution for applications that must run in Azure sovereign and air-gapped cloud environments, including AzureStackCloud, Azure Government Secret, and Azure Government Top Secret. In these environments, the identity authority host, Azure Resource Manager endpoint, and token audience values can differ from the defaults assumed by common SDK samples, which makes naive `azure-identity` usage unreliable.

The proposed solution needs to show a safe web app pattern for these environments: internal-only access, managed identity for service-to-service authentication, and explicit cloud metadata so the same application can switch between Azure Government and custom classified or Azure Stack deployments without code forks.

## Goals / Non-Goals

**Goals:**

- Provide a reference private web app architecture that works in sovereign and Azure Stack environments.
- Make cloud selection configuration-driven so authority hosts, management endpoints, and audience URLs are explicit inputs.
- Standardize how the app constructs `azure-identity` credentials and Azure SDK clients for control-plane and data-plane calls.
- Preserve air-gap and high-assurance requirements by default: managed identity, private endpoints, internal DNS, and no public dependencies.

**Non-Goals:**

- Build a complete production SaaS product or provision every possible Azure service.
- Support browser-direct ARM access across all target environments.
- Solve cross-domain transfer workflows between connected and disconnected environments.
- Hide genuine platform differences between sovereign environments when those differences require explicit operator choices.

## Decisions

### 1. Use a backend-for-frontend architecture

The reference solution will use an internal web UI that talks to a backend API, and the backend API will be the only layer that calls Azure Resource Manager, Key Vault, Storage, or other Azure services.

**Why:** This keeps cloud-specific endpoints, audience values, and credentials out of the browser and gives the app one place to enforce identity, RBAC, and diagnostics behavior.

**Alternative considered:** A browser-only SPA that acquires ARM tokens directly. This was rejected because custom audience handling, CORS, and diagnostic troubleshooting are harder in restricted networks.

### 2. Introduce a first-class cloud profile registry

The app will resolve a named cloud profile at startup. Each profile will include, at minimum:

- `authorityHost`
- `resourceManagerEndpoint`
- `resourceManagerAudience`
- `tenantId` or tenant hint
- Service endpoint suffixes for Storage, Key Vault, SQL, and optional Microsoft Graph
- Optional portal or metadata endpoints used by diagnostics

**Why:** In AzureStackCloud and classified environments, the management endpoint and token audience cannot be safely inferred from one another, and SDK defaults may not contain the target cloud at all.

**Alternative considered:** Rely only on built-in `AzureAuthorityHosts` and default ARM scopes. This was rejected because it does not cover custom Azure clouds consistently.

### 3. Wrap `azure-identity` in a deterministic credential factory

The reference app will expose a credential factory that selects the right `azure-identity` credential for the environment:

- Deployed workloads: `ManagedIdentityCredential` or `WorkloadIdentityCredential`
- Local development: explicit interactive or service principal flows with the selected `authorityHost`

The factory should avoid broad, opaque fallback chains where possible and require explicit configuration for unsupported credential modes.

**Why:** Sovereign and disconnected environments benefit from predictable auth behavior and clearer troubleshooting than the default catch-all experience.

**Alternative considered:** Use `DefaultAzureCredential` everywhere with no wrapper. This was rejected because troubleshooting cloud-specific failures becomes harder and unsupported sources may still be probed.

### 4. Separate control-plane audience logic from service URL construction

The reference implementation will build Azure clients in two steps:

1. Resolve the service base URL or DNS suffix from the active cloud profile.
2. Resolve the exact token scope or audience from the same profile and pass it explicitly when acquiring tokens or constructing clients.

**Why:** Some target environments use different values for endpoint hostnames and access token audiences. Treating them as separate configuration eliminates a common source of auth failures.

### 5. Default to a private, air-gap-ready deployment baseline

The deployment pattern will assume:

- Internal ingress only
- Private endpoints for dependent services
- Managed identity for app-to-service auth
- Internal DNS and certificate trust
- Private ACR or mirrored package sources for build and runtime assets

**Why:** This matches the intended target environments and prevents the reference solution from depending on public internet connectivity or public service endpoints.

## Risks / Trade-offs

- **[Risk] SDK gaps for custom clouds** → **Mitigation:** centralize endpoint and audience mapping in the cloud profile layer and test client creation against each supported environment.
- **[Risk] Operators assume audience equals endpoint** → **Mitigation:** require separate configuration fields and add startup validation that fails closed when they are missing or inconsistent.
- **[Risk] Local development cannot fully mirror a classified deployment** → **Mitigation:** provide a limited local mode that validates configuration and identity bootstrap without depending on public cloud defaults.
- **[Risk] Backend mediation adds an extra hop** → **Mitigation:** keep the backend focused on token brokerage, policy enforcement, and sample Azure operations so the security and operability gains outweigh the complexity.

## Migration Plan

1. Define the cloud profile schema and provide seed profiles for Azure Government and at least one AzureStackCloud-style environment.
2. Build the credential factory and cloud-aware client builders around `azure-identity`.
3. Scaffold the reference web app and backend API using the backend-for-frontend flow.
4. Add diagnostics, validation, and deployment assets for private sovereign environments.

## Open Questions

- Which runtime should serve as the primary reference implementation: Node.js/TypeScript, .NET, or both?
- Do the initial target environments require Microsoft Graph access, or should the first iteration focus only on ARM plus one data-plane service?
- Which exact management endpoint and audience combinations should be included as canonical examples for Secret and Top Secret deployments?
