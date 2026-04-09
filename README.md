# sovereign-auth

Reference web app architecture for **Azure Government**, **Azure Government Secret / Top Secret**, and **AzureStackCloud-style** environments that need explicit authority hosts, management endpoints, and token audiences when using the **`azure-identity`** stack.

👉 **[Full documentation →](https://adamdost-0.github.io/soverign-auth)**

## What this repo includes

- A minimal **backend-for-frontend** Node.js/TypeScript web app
- A **cloud profile registry** for sovereign and custom Azure clouds
- A deterministic **credential factory** that auto-detects non-public authority hosts and sets `disableInstanceDiscovery: true`
- Sample **ARM** and **Storage** API calls with explicit token audiences

## Reference architecture

```text
User Browser
    |
    |  private/internal ingress
    v
Reference Web UI  -->  Backend-for-Frontend API
                             |
                             | azure-identity
                             |  - ManagedIdentityCredential
                             |  - WorkloadIdentityCredential
                             |  - AzureCliCredential / DeviceCodeCredential
                             v
                   Cloud-aware client builders
                     |                   |
                     | ARM audience      | Storage / Key Vault audience
                     v                   v
              Azure Resource Manager   Data-plane services
```

## Quick start

```bash
git clone https://github.com/adamdost-0/soverign-auth.git
cd soverign-auth
npm install
cp .env.example .env
npm run dev
```

## Documentation

- [Getting Started](https://adamdost-0.github.io/soverign-auth/getting-started) — Local dev setup and cloud selection
- [Cloud Profiles](https://adamdost-0.github.io/soverign-auth/cloud-profiles) — Cloud profile model and built-in profiles
- [Authentication](https://adamdost-0.github.io/soverign-auth/authentication) — Private cloud auth, `disableInstanceDiscovery`, and credential types
- [Air-Gap Patterns](https://adamdost-0.github.io/soverign-auth/air-gap-patterns) — Registry mirroring and air-gapped deployment patterns
- [Deployment](https://adamdost-0.github.io/soverign-auth/deployment) — Bicep baseline, compliance tags, and RBAC setup

## Important note for classified clouds

This repository does **not** hardcode enclave-specific Secret or Top Secret endpoints. Supply those values through the JSON examples in `cloud-profiles/`, the documented audience environment variables, and the private DNS zone parameters in `infra/main.parameters.example.json` so the same app can run against your exact AzureStackCloud or sovereign deployment without code forks.
