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

## Local Docker Compose

For local Azure Commercial testing, seed container-only credentials from an ignored env file:

```bash
cp .env.docker.example .env.docker.local
# Fill in tenant, client, secret, subscription, and optional storage account values.
docker compose --env-file .env.docker.local up --build
```

Open <http://localhost:3000>. The example env file sets `AZURE_CLOUD=azure-commercial` and `AUTH_MODE=clientSecret`; no Azure Commercial endpoint overrides are required.

For Azure Stack Hub or custom Azure clouds whose login, ARM, or data-plane endpoints use a private CA, place the root/intermediate CA chain in a local PEM file and enable the private CA override:

```bash
# In .env.docker.local:
# AZURE_CLOUD=azurestack-custom
# AZURE_AUTHORITY_HOST=https://login.mystack.contoso.local/
# AZURE_RESOURCE_MANAGER_ENDPOINT=https://management.mystack.contoso.local/
# AZURE_RESOURCE_MANAGER_AUDIENCE=https://management.mystack.contoso.local/
# AGC_AUTH_HELPER_CA_BUNDLE=./certs/private-cloud-ca.pem

docker compose --env-file .env.docker.local \
  -f docker-compose.yml \
  -f docker-compose.private-ca.yml \
  up --build
```

## Documentation

- [Getting Started](https://adamdost-0.github.io/agc-auth-helper/getting-started) — Local dev setup and cloud selection
- [Cloud Profiles](https://adamdost-0.github.io/agc-auth-helper/cloud-profiles) — Cloud profile model and built-in profiles
- [Authentication](https://adamdost-0.github.io/agc-auth-helper/authentication) — Private cloud auth, `disableInstanceDiscovery`, and credential types
- [Air-Gap Flow Impact](https://adamdost-0.github.io/agc-auth-helper/airgap-flow-impact) — Simple SVG diagrams showing how air-gap settings change the auth flow
- [Code Snippets](https://adamdost-0.github.io/agc-auth-helper/code-snippets) — Copy-paste `azure-identity` code for TypeScript, Python, .NET, Go, and CLI
- [Deployment](https://adamdost-0.github.io/agc-auth-helper/deployment) — Bicep baseline, compliance tags, and RBAC setup

## Important note for classified clouds

This repository does **not** hardcode enclave-specific Secret or Top Secret endpoints. Supply those values through the JSON examples in `cloud-profiles/`, the documented audience environment variables, and the private DNS zone parameters in `infra/main.parameters.example.json` so the same app can run against your exact AzureStackCloud or sovereign deployment without code forks.
