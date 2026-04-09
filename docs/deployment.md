---
title: Deployment
layout: default
nav_order: 5
---

# Deployment

This guide walks through deploying the sovereign-auth reference app to Azure Government and air-gapped Azure environments using the Bicep infrastructure-as-code template.

## What Gets Deployed

The `infra/main.bicep` template provisions a complete, hardened infrastructure stack:

### Core Compute & Networking

- **Virtual Network (VNet)** — 10.42.0.0/16 with two subnets:
  - `app` (10.42.1.0/24) — Delegated to App Service for integration
  - `private-endpoints` (10.42.2.0/24) — Hosts private endpoints for PaaS services
- **App Service Plan** — P1v3 (Premium) Linux instance
- **Web App** — Node.js 20 LTS with HTTPS-only, system-assigned managed identity

### Storage & Secrets

- **Storage Account (V2)** — Standard LRS with:
  - `publicNetworkAccess: Disabled`
  - `allowBlobPublicAccess: false`
  - `allowSharedKeyAccess: false` (Managed Identity only)
  - `minimumTlsVersion: TLS1_2`
  - Network ACLs: Default action `Deny` with `AzureServices` bypass
- **Key Vault** — Standard tier with:
  - `publicNetworkAccess: Disabled`
  - RBAC authorization (no access policies)
  - Soft delete + purge protection (90-day retention)
  - Network ACLs: Default action `Deny` with no bypass

### Private Endpoints & DNS

- **Private Endpoints** for:
  - Web App (sites)
  - Storage Blob
  - Key Vault (vault)
- **Private DNS Zones** linked to the VNet:
  - `privatelink.blob.core.usgovcloudapi.net` (gov) or `privatelink.blob.core.windows.net` (commercial)
  - `privatelink.vaultcore.usgovcloudapi.net` (gov) or `privatelink.vaultcore.windows.net` (commercial)
  - `privatelink.azurewebsites.us` (gov) or `privatelink.azurewebsites.com` (commercial)

### Monitoring & Diagnostics

- **Log Analytics Workspace** — 30-day retention, PerGB2018 pricing
- **Diagnostic Settings** on all resources (Web App, Storage, Key Vault) sending logs and metrics to Log Analytics

### Identity & Access Control

**Role Assignments** (via system-assigned managed identity):
- **Reader** — Resource Group scope (allows reading resource metadata)
- **Storage Blob Data Reader** — Storage Account scope (read-only blob access)
- **Key Vault Secrets User** — Key Vault scope (read secrets, not certificates)

Roles are assigned with least-privilege at resource scope, never at subscription level.

### Resource Tags

Every resource receives compliance and governance tags:
- `Environment` — dev, staging, or prod
- `ManagedBy` — bicep, terraform, etc.
- `Project` — Project name (e.g., "sovereign-auth")
- `Owner` — Team or individual responsible
- `Classification` — CUI, Secret, or TopSecret
- `Compliance` — FedRAMP-High, IL4, IL5, IL6

## Security Baseline

This deployment implements a defense-in-depth security model aligned with FedRAMP High and DoD SRG IL4–IL6 requirements:

### Network Isolation

- **No public IP addresses** — All compute and PaaS resources are private
- **Private endpoints** — Storage, Key Vault, and Web App accessible only through the VNet
- **No public egress** — Apps must use private network paths or Azure integration
- **Network ACLs** — Storage and Key Vault deny all traffic by default; only Azure services bypass

### Encryption & TLS

- **TLS 1.2 minimum** enforced on Web App, Storage, and all endpoints
- **HTTPS-only** on the Web App; HTTP redirects to HTTPS
- **Encryption at rest** — Storage uses platform-managed encryption (Microsoft.Storage)
- **Encryption in transit** — All connections use TLS 1.2+

> **Note:** For customer-managed keys (CMK), extend the template with a Key Vault key resource and add `encryption.keyvaultproperties` to Storage and Key Vault settings.

### Authentication & Authorization

- **System-assigned managed identity** — No service principal credentials or connection strings in config
- **RBAC-only** — Key Vault uses RBAC authorization, not legacy access policies
- **No shared keys** — Storage account disallows SharedKey authentication
- **Least privilege** — Roles scoped to resources and principal IDs

### Public Network Access

All PaaS resources explicitly disable public access:

```bicep
publicNetworkAccess: 'Disabled'
```

This prevents accidental exposure through misconfigured NSGs or firewall rules.

### Diagnostics & Auditing

- **Diagnostic settings** send logs and metrics to Log Analytics for audit trails
- **All categories enabled** — `allLogs` category on Web App and Storage, `audit` category on Key Vault
- **30-day retention** — Logs are available for 30 days; integrate with Azure Sentinel or SIEM for long-term retention

## Parameters

All parameters are defined in `infra/main.parameters.example.json` and support environment-specific overrides.

| Parameter | Type | Default | Description | Guidance |
|-----------|------|---------|-------------|----------|
| `location` | string | `resourceGroup().location` | Azure region for resources | **Must be a gov region:** `usgovvirginia`, `usgovarizona`, or `usgovtexas` for Azure Gov; `usgovvirginia2` for Gov Secret; custom region for Stack Hub |
| `projectName` | string | `sovereign-auth` | Project name for resource naming and tags | Used in names: `vnet-{projectName}-{environment}`, `app-{projectName}-{environment}-{suffix}` |
| `environment` | string | `dev` | Environment tag and name component | Allowed: `dev`, `staging`, `prod` |
| `managedBy` | string | `bicep` | ManagedBy tag value | E.g., `bicep`, `terraform`, `arm` |
| `owner` | string | `platform-team` | Owner tag value | Team or on-call email |
| `classification` | string | `CUI` | Data classification tag | Allowed: `CUI`, `Secret`, `TopSecret` |
| `compliance` | string | `FedRAMP-High` | Compliance framework tag | Allowed: `FedRAMP-High`, `IL4`, `IL5`, `IL6` |
| `cloudProfileName` | string | `azure-us-government` | Cloud profile name passed to Web App | Web app reads `AZURE_CLOUD` env var; supported: `azure-us-government`, `azure-us-government-secret`, `azure-us-government-top-secret` |
| `linuxFxVersion` | string | `NODE\|20-lts` | Linux runtime stack | E.g., `NODE\|20-lts`, `NODE\|18-lts`, `DOTNETCORE\|8.0` |
| `blobPrivateDnsZoneName` | string | `privatelink.blob.core.usgovcloudapi.net` | Private DNS zone for Blob storage | **Override per cloud:** Gov Secret/Top Secret may use different suffixes; Stack Hub uses internal DNS |
| `keyVaultPrivateDnsZoneName` | string | `privatelink.vaultcore.usgovcloudapi.net` | Private DNS zone for Key Vault | **Override per cloud:** Similar to blob; must match your internal DNS |
| `webPrivateDnsZoneName` | string | `privatelink.azurewebsites.us` | Private DNS zone for Web App | **Override per cloud:** Gov Secret/Top Secret and Stack Hub may differ |

### Cloud-Specific Parameter Overrides

#### Azure Government (IL4)

```json
{
  "location": { "value": "usgovvirginia" },
  "cloudProfileName": { "value": "azure-us-government" },
  "blobPrivateDnsZoneName": { "value": "privatelink.blob.core.usgovcloudapi.net" },
  "keyVaultPrivateDnsZoneName": { "value": "privatelink.vaultcore.usgovcloudapi.net" },
  "webPrivateDnsZoneName": { "value": "privatelink.azurewebsites.us" }
}
```

#### Azure Government Secret (IL5)

```json
{
  "location": { "value": "usgovvirginia2" },
  "cloudProfileName": { "value": "azure-us-government-secret" },
  "classification": { "value": "Secret" },
  "compliance": { "value": "IL5" }
}
```

> **DNS Zone Override Required:** Check your Secret cloud's internal DNS to get the correct private DNS zone names; they may differ from public gov cloud.

#### Azure Government Top Secret (IL6)

```json
{
  "location": { "value": "<TS/SCI-region>" },
  "cloudProfileName": { "value": "azure-us-government-top-secret" },
  "classification": { "value": "TopSecret" },
  "compliance": { "value": "IL6" }
}
```

> **Note:** Top Secret clouds are fully air-gapped. Coordinate with your security/compliance team for DNS zones and any necessary network routing.

#### Azure Stack Hub (On-Premises)

For on-premises deployments using Azure Stack Hub, refer to the section [AzureStack Considerations](#azurestack-considerations) below.

## Deployment Commands

### Prerequisites

```bash
# Ensure you have the Azure CLI installed
az version

# Verify you have credentials for your target cloud
az account list
```

### Azure Government

```bash
# Set the cloud to Azure Government
az cloud set --name AzureUSGovernment

# Log in (uses device login or service principal)
az login

# Create or verify your resource group
az group create \
  --name rg-sovereign-auth \
  --location usgovvirginia

# Deploy the Bicep template
az deployment group create \
  --resource-group rg-sovereign-auth \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.example.json

# Retrieve outputs
az deployment group show \
  --resource-group rg-sovereign-auth \
  --name main \
  --query properties.outputs
```

### Azure Government Secret (IL5)

```bash
# Set the cloud to Azure Government Secret (requires access)
az cloud set --name AzureUSGovernmentSecret

az login

az group create \
  --name rg-sovereign-auth \
  --location usgovvirginia2

# Create a parameters override file for Secret cloud
cat > secret-params.json << 'EOF'
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "location": { "value": "usgovvirginia2" },
    "projectName": { "value": "sovereign-auth" },
    "environment": { "value": "dev" },
    "cloudProfileName": { "value": "azure-us-government-secret" },
    "classification": { "value": "Secret" },
    "compliance": { "value": "IL5" }
  }
}
EOF

az deployment group create \
  --resource-group rg-sovereign-auth \
  --template-file infra/main.bicep \
  --parameters @secret-params.json
```

### Azure Government Top Secret (IL6)

```bash
# Set the cloud (coordinate with your security team for exact name)
az cloud set --name <AzureUSGovernmentTopSecret>

az login

# Deploy similar to Secret cloud, updating parameters for Top Secret region and profile
```

### Multi-Environment Deployment

Create environment-specific parameter files:

- `infra/main.parameters.dev.json`
- `infra/main.parameters.staging.json`
- `infra/main.parameters.prod.json`

Then deploy with:

```bash
az deployment group create \
  --resource-group rg-sovereign-auth-dev \
  --template-file infra/main.bicep \
  --parameters @infra/main.parameters.dev.json
```

## AzureStack Considerations

For **Azure Stack Hub** deployments (on-premises or hybrid), use the ARM JSON template (`infra/main.json`) instead of Bicep. JSON templates have wider compatibility across Stack versions.

### Key Differences

| Aspect | Azure Government | Azure Stack Hub |
|--------|-----------------|-----------------|
| **Template Format** | Bicep or ARM JSON | ARM JSON (recommended) |
| **API Versions** | Latest GA versions | Limited; check Stack version |
| **Private Link** | Fully supported | May be limited or unavailable |
| **Managed Identity** | Yes | Yes, but setup varies |
| **Cloud Profile Endpoint** | `usgovcloudapi.net` | Your Stack's internal endpoint |

### Deploying to Stack Hub

#### Step 1: Verify API Versions

Before deploying, check the supported API versions on your Stack Hub instance:

```bash
# Connect to your Stack Hub environment
az cloud set --name MyStack

az login

# List available providers and versions
az provider list --query "[].{Namespace:namespace, ApiVersions:apiVersions}" --out table
```

Update `infra/main.json` with API versions supported by your Stack.

#### Step 2: Prepare Parameters

```bash
# Create a Stack Hub-specific parameters file
cat > stack-params.json << 'EOF'
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "location": { "value": "<your-stack-region>" },
    "projectName": { "value": "sovereign-auth" },
    "environment": { "value": "dev" },
    "cloudProfileName": { "value": "<stack-profile>" },
    "blobPrivateDnsZoneName": { "value": "<stack-internal-dns-zone>" },
    "keyVaultPrivateDnsZoneName": { "value": "<stack-internal-dns-zone>" },
    "webPrivateDnsZoneName": { "value": "<stack-internal-dns-zone>" }
  }
}
EOF
```

#### Step 3: Deploy ARM Template

```bash
az group create \
  --name rg-sovereign-auth \
  --location <your-stack-region>

az deployment group create \
  --resource-group rg-sovereign-auth \
  --template-file infra/main.json \
  --parameters @stack-params.json
```

> **Compatibility Note:** If Private Link services are unavailable on your Stack, the template will fail. Work with your Stack operator to determine which services support private endpoints, then modify the template accordingly.

## Post-Deployment Configuration

After the template deploys successfully, configure the Web App with environment-specific settings:

### 1. Verify Deployment Outputs

```bash
# Retrieve the generated resource names
az deployment group show \
  --resource-group rg-sovereign-auth \
  --name main \
  --query properties.outputs \
  --output json
```

Expected outputs:
- `webAppName` — e.g., `app-sovereign-auth-dev-a1b2c3d4`
- `storageAccount` — e.g., `stsovauthd1e2f3g4`
- `keyVaultName` — e.g., `kv-sovereign-auth-dev-a1b2c3d4`

### 2. Configure Application Settings

The template pre-configures critical environment variables. Verify or add additional settings:

```bash
WEB_APP_NAME="app-sovereign-auth-dev-a1b2c3d4"

# View current app settings
az webapp config appsettings list --name $WEB_APP_NAME --resource-group rg-sovereign-auth

# Add or update app settings as needed
az webapp config appsettings set \
  --name $WEB_APP_NAME \
  --resource-group rg-sovereign-auth \
  --settings \
    WEBSITE_RUN_FROM_PACKAGE=1 \
    AZURE_CLOUD=azure-us-government \
    AUTH_MODE=managedIdentity \
    AZURE_STORAGE_ACCOUNT=stsovauthd1e2f3g4 \
    DEBUG=false
```

### 3. Deploy Application Code

Deploy your application to the Web App. If using GitHub Actions or Azure DevOps:

```bash
# Build your application
npm run build

# Deploy using zip deployment
az webapp deployment source config-zip \
  --resource-group rg-sovereign-auth \
  --name $WEB_APP_NAME \
  --src dist/app.zip
```

Or publish directly from your CI/CD pipeline using the Web App's deployment credentials.

### 4. Validate Connectivity

Once deployed, test private endpoint connectivity:

```bash
# SSH into the Web App container
az webapp create-remote-connection --resource-group rg-sovereign-auth --name $WEB_APP_NAME

# Inside the container, test connectivity to Storage and Key Vault:
nslookup stsovauthd1e2f3g4.blob.core.usgovcloudapi.net
nslookup kv-sovereign-auth-dev-a1b2c3d4.vault.usgovcloudapi.net

# Verify managed identity access
curl -s http://169.254.169.254/metadata/identity/oauth2/token?api-version=2017-09-01&resource=https://vault.usgovcloudapi.net | jq .
```

### 5. Monitor & Verify

Check the Log Analytics Workspace for application logs and metrics:

```bash
# Query Web App logs
az monitor log-analytics query \
  --workspace /subscriptions/<sub-id>/resourcegroups/rg-sovereign-auth/providers/microsoft.operationalinsights/workspaces/log-sovereign-auth-dev-xxx \
  --analytics-query "AppServiceConsoleLogs | take 50"
```

Or navigate to the resource group in the Azure portal (Government/Secret cloud) and view the Log Analytics Workspace and Application Insights dashboards.

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| **Deployment fails with "PublicNetworkAccess" error** | Template uses unsupported API version on Stack Hub or legacy cloud | Update API versions in `infra/main.json` to match your environment |
| **Private endpoint DNS resolution fails** | DNS zones not linked to VNet | Verify `privateDnsZones/virtualNetworkLinks` resources are created; check private DNS zone settings |
| **Web App cannot access Storage or Key Vault** | Managed identity lacks RBAC permissions | Verify role assignments exist: `az role assignment list --scope <resource-id>` |
| **Storage account shows "shared key disabled" error** | Application uses legacy connection strings | Update app code to use managed identity (e.g., `BlobClient.from_connection_string()` → Azure Identity SDK) |

## Next Steps

1. **Deploy application code** to the Web App
2. **Integrate Azure Sentinel** or your SIEM to ingest Log Analytics data
3. **Set up Azure Policy** for governance and compliance guardrails
4. **Enable backup & disaster recovery** if needed (e.g., geo-replication for Storage)
5. **Configure customer-managed keys (CMK)** in Key Vault if required by compliance policy

## References

- [Azure Bicep documentation](https://learn.microsoft.com/azure/azure-resource-manager/bicep/)
- [Azure Government cloud endpoints](https://learn.microsoft.com/azure/azure-government/documentation-government-get-started-connect-with-cli)
- [Private Link documentation](https://learn.microsoft.com/azure/private-link/private-link-overview)
- [Azure Stack Hub documentation](https://learn.microsoft.com/azure-stack/operator/azure-stack-overview)
- [FedRAMP High requirements](https://www.fedramp.gov/program-basics/fedramp-high/)
