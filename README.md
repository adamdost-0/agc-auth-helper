# AGC Auth Helper

Reference web app architecture for **Azure Government**, **Azure Government Secret / Top Secret**, and **AzureStackCloud-style** environments that need explicit authority hosts, management endpoints, and token audiences when using the **`azure-identity`** stack.

👉 **[Full documentation →](https://adamdost-0.github.io/agc-auth-helper)**

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
git clone https://github.com/adamdost-0/agc-auth-helper.git
cd agc-auth-helper
npm install
cp .env.example .env
npm run dev
```

## Documentation

- [Getting Started](https://adamdost-0.github.io/agc-auth-helper/getting-started) — Local dev setup and cloud selection
- [Cloud Profiles](https://adamdost-0.github.io/agc-auth-helper/cloud-profiles) — Cloud profile model and built-in profiles
- [Authentication](https://adamdost-0.github.io/agc-auth-helper/authentication) — Private cloud auth, `disableInstanceDiscovery`, and credential types
- [Code Snippets](https://adamdost-0.github.io/agc-auth-helper/code-snippets) — Copy-paste `azure-identity` code for TypeScript, Python, .NET, Go, and CLI
- [Deployment](https://adamdost-0.github.io/agc-auth-helper/deployment) — Bicep baseline, compliance tags, and RBAC setup

## Important note for classified clouds

This repository does **not** hardcode enclave-specific Secret or Top Secret endpoints. Supply those values through the JSON examples in `cloud-profiles/`, the documented audience environment variables, and the private DNS zone parameters in `infra/main.parameters.example.json` so the same app can run against your exact AzureStackCloud or sovereign deployment without code forks.
