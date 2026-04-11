---
title: Getting Started
layout: default
nav_order: 2
---

# Getting Started

This guide walks you through setting up and running the agc-auth-helper reference app locally or deploying it to Azure Government, Azure Government Secret/Top Secret, or AzureStack Hub environments.

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
   git clone https://github.com/adamdost-0/agc-auth-helper.git
   cd agc-auth-helper
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
   This repository does not include a separate package-mirror guide, so use the registry URL and certificate chain approved by your enclave or platform team.

## Configure Your Environment

### Step 1: Copy the Environment Template

```bash
cp .env.example .env
```

### Step 2: Select Your Cloud and Auth Mode

Edit `.env` and set:
- `AZURE_CLOUD` — Which cloud to target
- `AUTH_MODE` — How to authenticate locally

### Step 3: Collect the Cloud Values Before Writing Code

For Azure Air-Gap clouds, the biggest setup issue is usually missing environment-specific values. Ask your cloud operator or platform team for the following before you start debugging the SDK:

| Value | Why it matters | Example |
|------|----------------|---------|
| `authorityHost` | Passed to `@azure/identity` so Entra ID / ADFS token requests go to the correct authority | `https://login.tenantname.usgovcloudapi.net/` |
| `resourceManagerEndpoint` | Base URL for ARM REST calls | `https://management.tenantname.usgovcloudapi.net/` |
| `resourceManagerAudience` | Audience used to request ARM tokens | `https://management.tenantname.usgovcloudapi.net/` |
| Service DNS suffixes | Used to construct Storage, Key Vault, SQL, and ACR hostnames | `.blob.core.secret.contoso.internal` |
| Tenant and app identity values | Required for `clientSecret`, `deviceCode`, or workload federation flows | Tenant ID, client ID, secret, or federated token file |

> The built-in Secret, Top Secret, and Azure Stack profiles are templates. Treat them as examples until you replace the placeholder endpoints with real values from your environment.
{: .warning }

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

## Recommended Developer Workflow for Azure Air-Gap Clouds

Use this sequence when bringing up a new cloud or enclave:

1. **Resolve the cloud profile first** — confirm `authorityHost`, `resourceManagerEndpoint`, and `resourceManagerAudience` are the values your operator provided.
2. **Choose the right credential mode**:
   - `azureCli` for local dev in Azure Government or in a registered custom CLI cloud
   - `deviceCode` when you need interactive sign-in against a custom authority host
   - `clientSecret` for controlled integration testing
   - `managedIdentity` or `workloadIdentity` for deployed workloads
3. **Run the app and inspect `/api/profile`** before attempting service calls.
4. **Run the smoke test** for the selected cloud profile:
   ```bash
   npm run smoke-test -- --cloud <cloud-name>
   ```
5. **Only then test token acquisition**:
   ```bash
   AUTH_MODE=clientSecret npm run smoke-test -- --check-token --cloud <cloud-name>
   ```

This catches bad profile data early and avoids misdiagnosing a cloud-profile issue as an SDK issue.

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
- **[Cloud Profiles](./cloud-profiles.md)** — Review the cloud profile model, overrides, and validation rules
- **[Authentication](./authentication.md)** — Understand when `disableInstanceDiscovery` is required and which values each credential uses
- **[Code Snippets](./code-snippets.md)** — Copy the language-specific `azure-identity` pattern into your own app
