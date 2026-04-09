---
title: Getting Started
layout: default
nav_order: 2
---

# Getting Started

This guide walks you through setting up and running the sovereign-auth reference app locally or deploying it to Azure Government, Azure Government Secret/Top Secret, or AzureStack Hub environments.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 20+** and **npm** — [Download Node.js](https://nodejs.org/)
- **Azure CLI** — For local development and cloud configuration
  ```bash
  # Install Azure CLI
  curl -sL https://aka.ms/InstallAzureCLIDeb | sudo bash
  ```
- **Azure subscription** in your target cloud:
  - Azure Government (`usgovernment`)
  - Azure Government Secret (`usgovernmentsecret`)
  - Azure Government Top Secret (`usgovernmenttopsecret`)
  - AzureStack Hub (on-premises)

## Clone and Install

1. Clone the repository:
   ```bash
   git clone https://github.com/adamdost-0/sovereign-auth.git
   cd sovereign-auth
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

   **For air-gapped environments:** Point npm at your internal registry before installing:
   ```bash
   export NPM_REGISTRY_URL=https://your-internal-registry.example.mil/npm/
   cp .npmrc.example .npmrc
   npm install
   ```
   See [Air-Gap Patterns](../infra/air-gap.md) for detailed registry setup.

## Configure Your Environment

### Step 1: Copy the Environment Template

```bash
cp .env.example .env
```

### Step 2: Select Your Cloud and Auth Mode

Edit `.env` and set:
- `AZURE_CLOUD` — Which cloud to target
- `AUTH_MODE` — How to authenticate locally

### Azure Government (IL4)

For Azure Government in the `usgovernment` cloud:

```bash
# .env
AZURE_CLOUD=azure-us-government
AUTH_MODE=azureCli
AZURE_TENANT_ID=<your-tenant-id>
AZURE_SUBSCRIPTION_ID=<your-subscription-id>
AZURE_STORAGE_ACCOUNT=<your-storage-account-name>
PORT=3000
```

Set the Azure CLI to the government cloud:
```bash
az cloud set --name AzureUSGovernment
az login --tenant <your-tenant-id>
```

### Azure Government Secret / Top Secret

For classified clouds, update the cloud profile with your enclave's exact endpoints:

```bash
# .env
AZURE_CLOUD=azure-us-gov-secret
AUTH_MODE=clientSecret
AZURE_TENANT_ID=<enclave-tenant-id>
AZURE_CLIENT_ID=<service-principal-client-id>
AZURE_CLIENT_SECRET=<service-principal-secret>
AZURE_SUBSCRIPTION_ID=<enclave-subscription-id>

# Update these with your enclave's specific endpoints
AZURE_AUTHORITY_HOST=https://login.tenantname.usgovcloudapi.net/
AZURE_RESOURCE_MANAGER_ENDPOINT=https://management.tenantname.usgovcloudapi.net/
AZURE_RESOURCE_MANAGER_AUDIENCE=https://management.tenantname.usgovcloudapi.net/
```

Then update the cloud profile file:

```bash
# Edit cloud-profiles/azure-us-gov-secret.json
# Replace the placeholder endpoints with your enclave-provided values
```

### AzureStack Hub

For on-premises AzureStack environments:

```bash
# .env
AZURE_CLOUD=azurestack-custom
AUTH_MODE=clientSecret
AZURE_TENANT_ID=<stack-tenant-id>
AZURE_CLIENT_ID=<service-principal-client-id>
AZURE_CLIENT_SECRET=<service-principal-secret>
AZURE_SUBSCRIPTION_ID=<stack-subscription-id>

# Set to your Stack's domain
AZURE_AUTHORITY_HOST=https://login.mystack.contoso.local/
AZURE_RESOURCE_MANAGER_ENDPOINT=https://management.mystack.contoso.local/
AZURE_RESOURCE_MANAGER_AUDIENCE=https://management.mystack.contoso.local/
```

Alternatively, use a custom cloud profile file:

```bash
# .env
CUSTOM_CLOUD_PROFILE_PATH=./cloud-profiles/my-stack-custom.json
AUTH_MODE=clientSecret
```

```json
// cloud-profiles/my-stack-custom.json
{
  "name": "my-stack-custom",
  "authorityHost": "https://login.mystack.contoso.local/",
  "resourceManagerEndpoint": "https://management.mystack.contoso.local/",
  "resourceManagerAudience": "https://management.mystack.contoso.local/",
  "serviceDnsSuffixes": {
    "blob": ".blob.mystack.contoso.local",
    "keyvault": ".vault.mystack.contoso.local",
    "sql": ".database.mystack.contoso.local",
    "acr": ".azurecr.local"
  },
  "serviceAudiences": {
    "storage": "https://storage.mystack.contoso.local/",
    "keyvault": "https://vault.mystack.contoso.local/"
  }
}
```

## Run the App

Start the development server:

```bash
npm run dev
```

You should see:
```
Server running on http://localhost:3000
Cloud: azure-us-government
Auth Mode: azureCli
```

Open **http://localhost:3000** in your browser. The app will:
1. Display your current cloud profile
2. Attempt to acquire a token using the configured auth mode
3. Show diagnostics about your configuration

## Verify Your Configuration

### Check Cloud Profile

Visit **http://localhost:3000/api/profile** to see the resolved cloud profile:

```json
{
  "name": "azure-us-government",
  "authorityHost": "https://login.microsoftonline.us/",
  "resourceManagerEndpoint": "https://management.usgovcloudapi.net/",
  "resourceManagerAudience": "https://management.usgovcloudapi.net/",
  "serviceDnsSuffixes": {
    "blob": ".blob.core.usgovcloudapi.net",
    "keyvault": ".vault.usgovcloudapi.net"
  }
}
```

### Run Diagnostics

Visit **http://localhost:3000/api/diagnostics** to verify:
- Cloud detection
- Auth mode
- Token acquisition status
- Identity (tenant, client, subscription)

## Run Tests

### Unit Tests

```bash
npm test
```

### Smoke Tests

Validate all built-in cloud profiles:

```bash
npm run smoke-test -- --all
```

Probe token acquisition for the current cloud:

```bash
AUTH_MODE=azureCli npm run smoke-test -- --check-token
```

## Authentication Modes

The app supports five authentication modes. Choose based on your deployment context:

| Mode | Use Case | Requirements |
|------|----------|--------------|
| `managedIdentity` | App Service, Azure VM, AKS pod with system-assigned identity | Azure resource with system-assigned managed identity |
| `workloadIdentity` | Kubernetes with Workload Identity federation | OIDC-enabled AKS cluster, Workload Identity binding |
| `azureCli` | Local development | Azure CLI installed and `az login` completed |
| `deviceCode` | Disconnected hosts, CI/CD runners without browser | User-initiated device code flow (browser required for approval) |
| `clientSecret` | Integration testing, CI/CD pipelines | Service principal with client secret (never commit to repo) |

### Examples

**Local development with Azure Government:**
```bash
AUTH_MODE=azureCli
az cloud set --name AzureUSGovernment
az login --tenant <tenant-id>
npm run dev
```

**CI/CD pipeline:**
```bash
export AZURE_CLIENT_ID=<service-principal-id>
export AZURE_CLIENT_SECRET=<secret>  # Load from vault!
export AZURE_TENANT_ID=<tenant-id>
export AUTH_MODE=clientSecret
npm run start
```

**Deployed on App Service (Azure Government):**
```bash
# Set in App Service environment variables:
# AZURE_CLOUD=azure-us-government
# AUTH_MODE=managedIdentity
# The app auto-uses the system-assigned managed identity
npm run start
```

## Troubleshooting

### "Instance Discovery failed" error

This usually means:
1. You're targeting a private cloud (AzureStack, Secret, Top Secret) but haven't set the custom authority host.
2. The app didn't detect `disableInstanceDiscovery: true`.

**Solution:** Ensure `AZURE_AUTHORITY_HOST` is set to a non-standard endpoint:
```bash
AZURE_AUTHORITY_HOST=https://login.mystack.contoso.local/
```

The credential factory automatically detects non-well-known hosts and enables `disableInstanceDiscovery`.

### "Token acquisition failed" error

Check:
1. Your auth mode and credentials are correct (`az login` for `azureCli`, or service principal values for `clientSecret`)
2. Your subscription has access to the storage account
3. The storage account DNS suffix is correct for your cloud

Run diagnostics:
```bash
curl http://localhost:3000/api/diagnostics
```

### "Cloud profile not found" error

Verify `AZURE_CLOUD` is set to a valid profile name:
- `azure-commercial` (Azure Public)
- `azure-us-government` (Azure Government IL4)
- `azure-us-gov-secret` (Azure Government Secret IL5)
- `azure-us-gov-topsecret` (Azure Government Top Secret IL6)
- `azurestack-custom` (AzureStack Hub)

Or specify a custom profile:
```bash
CUSTOM_CLOUD_PROFILE_PATH=./my-custom-profile.json
```

## Next Steps

- **[Deployment](./deployment.md)** — Deploy to App Service with Bicep
- **[Architecture](./architecture.md)** — Understand the reference design
- **[Air-Gap Patterns](../infra/air-gap.md)** — Setup for disconnected environments
- **[Cloud Profiles](../cloud-profiles/README.md)** — Reference for all cloud endpoints
