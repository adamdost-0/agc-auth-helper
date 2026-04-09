---
title: Cloud Profiles
layout: default
nav_order: 3
---

# Cloud Profiles

A **cloud profile** is a JSON configuration that encapsulates all Azure environment-specific values—endpoints, audiences, DNS suffixes—so application code never hardcodes cloud-specific URLs. This abstraction enables the same binary to run against Azure Commercial, Azure Government, Azure Government Secret/Top Secret, Azure Stack Hub, or custom private clouds without recompilation.

## What is a Cloud Profile?

When deploying to different Azure environments, each has distinct:
- **Authority endpoints** for Entra ID (Azure AD) login
- **Resource Manager endpoints** for infrastructure management
- **Service audiences** (token scopes) for accessing services like Storage, Key Vault
- **DNS suffixes** for constructing service URLs (e.g., `.blob.core.windows.net` vs. `.blob.core.usgovcloudapi.net`)

A cloud profile bundles all these into a single JSON document. The application loads it at startup and uses it to:
- Build absolute URLs for all Azure services
- Configure credential factories with the correct Entra ID authority
- Compute OAuth scopes for token requests
- Automatically detect and disable MSAL instance discovery for private clouds

## Profile Structure

The `CloudProfile` TypeScript interface defines the complete structure:

```typescript
export type CloudEnvironment =
  | "public"              // Azure Commercial (public cloud)
  | "usgovernment"        // Azure Government (IL4/IL5)
  | "usgovernmentsecret"  // Azure Government Secret (IL6 air-gapped)
  | "usgovernmenttopsecret" // Azure Government Top Secret (TS/SCI air-gapped)
  | "azurestackcloud"     // Azure Stack Hub or on-premises
  | "custom";             // Custom or unknown private cloud

export interface ServiceDnsSuffixes {
  storage: string;        // e.g., ".blob.core.windows.net"
  keyVault: string;       // e.g., ".vault.azure.net"
  sqlServer: string;      // e.g., ".database.windows.net"
  containerRegistry: string; // e.g., ".azurecr.io"
}

export interface ServiceAudiences {
  arm: string;            // e.g., "https://management.azure.com/"
  storage: string;        // e.g., "https://storage.azure.com/"
  keyVault: string;       // e.g., "https://vault.azure.net/"
}

export interface CloudProfile {
  name: string;           // Identifier used in AZURE_CLOUD (e.g., "azure-commercial")
  displayName: string;    // Human-readable name (e.g., "Azure Commercial (Public)")
  environment: CloudEnvironment; // The environment type
  
  authorityHost: string;  // Entra ID login endpoint (e.g., https://login.microsoftonline.com/)
  resourceManagerEndpoint: string; // ARM REST API endpoint (e.g., https://management.azure.com/)
  resourceManagerAudience: string; // ARM service audience for token scopes
  
  tenantId?: string;      // (Optional) default tenant for multi-tenant scenarios
  portalUrl?: string;     // (Optional) portal URL (e.g., https://portal.azure.com/)
  metadataEndpoint?: string; // (Optional) ARM metadata endpoint for dynamic discovery
  
  serviceDnsSuffixes: ServiceDnsSuffixes; // DNS suffixes for constructing service URLs
  serviceAudiences: ServiceAudiences; // Service audiences for token requests
  
  notes?: string;         // (Optional) deployment notes or warnings
}
```

### Field Descriptions

| Field | Type | Required | Purpose |
|-------|------|----------|---------|
| `name` | string | Yes | Profile identifier; used in `AZURE_CLOUD` env var and built-in profile registry |
| `displayName` | string | Yes | Human-readable name for UI/logging |
| `environment` | CloudEnvironment | Yes | Cloud environment type (public, usgovernment, etc.) |
| `authorityHost` | string (URL) | Yes | Entra ID login endpoint; must be absolute URL ending with `/` |
| `resourceManagerEndpoint` | string (URL) | Yes | Azure Resource Manager REST API endpoint |
| `resourceManagerAudience` | string (URL) | Yes | Service audience for ARM token requests |
| `tenantId` | string | No | Default tenant ID for authentication |
| `portalUrl` | string (URL) | No | Portal URL for administrative access |
| `metadataEndpoint` | string (URL) | No | ARM metadata endpoint for dynamic endpoint discovery |
| `serviceDnsSuffixes.storage` | string | Yes | DNS suffix for storage accounts (must start with `.`) |
| `serviceDnsSuffixes.keyVault` | string | Yes | DNS suffix for Key Vault |
| `serviceDnsSuffixes.sqlServer` | string | Yes | DNS suffix for SQL Database |
| `serviceDnsSuffixes.containerRegistry` | string | Yes | DNS suffix for Azure Container Registry |
| `serviceAudiences.arm` | string (URL) | Yes | Service audience for ARM (usually same as resourceManagerAudience) |
| `serviceAudiences.storage` | string (URL) | Yes | Service audience for Storage accounts |
| `serviceAudiences.keyVault` | string (URL) | Yes | Service audience for Key Vault |
| `notes` | string | No | Deployment notes or warnings |

## Built-in Profiles

Sovereign Auth includes 5 built-in cloud profiles covering the most common deployment scenarios:

| Profile Name | Environment | Authority Host | Resource Manager Endpoint | Notes |
|--------------|-------------|-----------------|---------------------------|-------|
| `azure-commercial` | public | `login.microsoftonline.com` | `management.azure.com` | Default for commercial cloud workloads; all endpoints public |
| `azure-us-government` | usgovernment | `login.microsoftonline.us` | `management.usgovcloudapi.net` | Azure Government (IL4/IL5); government-only endpoints |
| `azure-us-gov-secret` | usgovernmentsecret | `login.secret.contoso.internal` | `management.secret.contoso.internal` | **⚠️ Contains placeholders** — must update to actual Secret enclave endpoints |
| `azure-us-gov-topsecret` | usgovernmenttopsecret | `login.topsecret.contoso.internal` | `management.topsecret.contoso.internal` | **⚠️ Contains placeholders** — must update to actual Top Secret enclave endpoints |
| `azurestack-custom` | azurestackcloud | `login.azurestack.contoso.local` | `management.azurestack.contoso.local` | **⚠️ Contains placeholders** — customize for your Azure Stack Hub or on-premises deployment |

{: .warning }
> **Secret and Top Secret profiles contain placeholder endpoints** (`*.contoso.internal`). Before deploying to a Secret or Top Secret enclave, you **must**:
> 1. Obtain the actual enclave endpoints from your cloud operator
> 2. Update all endpoint URLs (authorityHost, resourceManagerEndpoint, DNS suffixes) in your custom profile or override via environment variables

{: .note }
> **For AzureStack Hub or custom private clouds**: Placeholder endpoints are provided as a template. Replace them with your actual infrastructure endpoints. See [Creating a Custom Profile](#creating-a-custom-profile) below.

## Creating a Custom Profile

For clouds not covered by the built-in profiles—such as a private AzureStack deployment or a custom Entra ID domain—you can create a custom JSON profile file.

### Step 1: Create the Profile JSON

Create a file (e.g., `my-azurestack-profile.json`) matching the structure below:

```json
{
  "name": "my-azurestack",
  "displayName": "My AzureStack Hub",
  "environment": "azurestackcloud",
  "authorityHost": "https://adfs.azurestack.local/adfs/",
  "resourceManagerEndpoint": "https://management.azurestack.local/",
  "resourceManagerAudience": "https://management.azurestack.local/",
  "serviceDnsSuffixes": {
    "storage": ".blob.azurestack.local",
    "keyVault": ".vault.azurestack.local",
    "sqlServer": ".database.azurestack.local",
    "containerRegistry": ".azurecr.azurestack.local"
  },
  "serviceAudiences": {
    "arm": "https://management.azurestack.local/",
    "storage": "https://storage.azurestack.local/",
    "keyVault": "https://vault.azurestack.local/"
  },
  "notes": "Custom AzureStack Hub deployment in corporate datacenter. ADFS authority is used instead of Entra ID."
}
```

### Step 2: Place the File

Save the JSON file in a location accessible to your application, e.g.:
- `/etc/sovereign-auth/profiles/my-azurestack.json` (production)
- `./cloud-profiles/my-custom.json` (development)
- Any path reachable by the application

### Step 3: Load the Profile

Set the `CUSTOM_CLOUD_PROFILE_PATH` environment variable to point to your custom profile:

```bash
export CUSTOM_CLOUD_PROFILE_PATH=/etc/sovereign-auth/profiles/my-azurestack-profile.json
npm start
```

Or pass it programmatically:

```typescript
import { resolveCloudProfile } from "./src/config/cloudProfile";

const profile = resolveCloudProfile({
  customProfilePath: "/etc/sovereign-auth/profiles/my-azurestack-profile.json"
});
```

### Step 4: Validation

The profile is automatically validated when loaded:
- All URL fields must be absolute URLs (validated via `new URL()`)
- DNS suffixes must start with `.`
- Required fields are enforced
- Invalid profiles throw descriptive errors

## Environment Variable Overrides

You can override individual fields from a cloud profile using environment variables. This is useful for:
- Testing endpoints in dev/staging
- Deploying the same Docker image to different clouds by changing env vars only
- Gradually migrating endpoints without redeploying code

### Authority and Endpoint Overrides

| Environment Variable | Overrides | Example |
|----------------------|-----------|---------|
| `AZURE_AUTHORITY_HOST` | `CloudProfile.authorityHost` | `https://login.microsoftonline.us/` |
| `AZURE_RESOURCE_MANAGER_ENDPOINT` | `CloudProfile.resourceManagerEndpoint` | `https://management.usgovcloudapi.net/` |
| `AZURE_RESOURCE_MANAGER_AUDIENCE` | `CloudProfile.resourceManagerAudience` | `https://management.usgovcloudapi.net/` |
| `AZURE_ARM_AUDIENCE` | Alias for `AZURE_RESOURCE_MANAGER_AUDIENCE` | (same as above) |

### Service DNS Suffix Overrides

| Environment Variable | Overrides | Example |
|----------------------|-----------|---------|
| `AZURE_STORAGE_DNS_SUFFIX` | `CloudProfile.serviceDnsSuffixes.storage` | `.blob.core.usgovcloudapi.net` |
| `AZURE_KEYVAULT_DNS_SUFFIX` | `CloudProfile.serviceDnsSuffixes.keyVault` | `.vault.usgovcloudapi.net` |
| `AZURE_SQL_DNS_SUFFIX` | `CloudProfile.serviceDnsSuffixes.sqlServer` | `.database.usgovcloudapi.net` |
| `AZURE_ACR_DNS_SUFFIX` | `CloudProfile.serviceDnsSuffixes.containerRegistry` | `.azurecr.us` |

{: .note }
> DNS suffixes **must start with a dot** (e.g., `.blob.core.windows.net`, not `blob.core.windows.net`). This allows them to be concatenated with service names to form FQDNs.

### Service Audience Overrides

| Environment Variable | Overrides | Example |
|----------------------|-----------|---------|
| `AZURE_STORAGE_AUDIENCE` | `CloudProfile.serviceAudiences.storage` | `https://storage.azure.com/` |
| `AZURE_KEYVAULT_AUDIENCE` | `CloudProfile.serviceAudiences.keyVault` | `https://vault.azure.net/` |

### Tenant ID Override

| Environment Variable | Overrides | Example |
|----------------------|-----------|---------|
| `AZURE_TENANT_ID` | `CloudProfile.tenantId` | `00000000-0000-0000-0000-000000000000` |

### Resolution Order

When resolving a cloud profile, the system applies overrides in this order:

1. Start with the base profile (from `AZURE_CLOUD` or a built-in default)
2. Apply all `AZURE_*` environment variable overrides
3. If `CUSTOM_CLOUD_PROFILE_PATH` is set, it **overrides everything** and is used directly

This means you can:
- Use a built-in profile as a base and override just the authority host for testing
- Use a custom profile and override a few specific endpoints without editing the JSON file

## ARM Metadata Endpoint

For some private clouds (especially Azure Stack Hub and Secret/Top Secret enclaves), you can dynamically discover endpoints by querying the ARM metadata endpoint. This is useful when exact endpoint values are unknown or may change.

### Metadata Endpoint Query

```
GET https://{arm-endpoint}/metadata/endpoints?api-version=2015-01-01
```

**Example request** (Azure Stack Hub):

```bash
curl -s "https://management.azurestack.local/metadata/endpoints?api-version=2015-01-01" \
  --cacert /etc/ssl/certs/ca-bundle.crt | jq .
```

### Response Shape

The endpoint returns a JSON object with discovery metadata:

```json
{
  "portalEndpoint": "https://portal.azurestack.local/",
  "graphEndpoint": "https://graph.azurestack.local/",
  "authentication": {
    "audiences": [
      "https://management.azurestack.local/",
      "https://graph.azurestack.local/"
    ],
    "loginEndpoint": "https://adfs.azurestack.local/adfs/",
    "tenant": "default"
  }
}
```

### Using Metadata for Discovery

If you have the `metadataEndpoint` field set in your cloud profile, you can query it to verify endpoints or dynamically retrieve them:

```typescript
import { CloudProfile } from "./src/config/cloudProfile";

async function discoverEndpoints(profile: CloudProfile): Promise<any> {
  if (!profile.metadataEndpoint) {
    throw new Error("Metadata endpoint not configured");
  }

  const response = await fetch(profile.metadataEndpoint + "?api-version=2015-01-01");
  return response.json();
}
```

{: .note }
> The metadata endpoint is **optional**. If not available, use the static configuration in the cloud profile instead. For air-gapped environments with no internet access, static profiles are preferred.

## Validation

Cloud profiles are validated in two phases:

### Phase 1: Schema Validation

The JSON structure is validated against `cloud-profiles/schema.json`. This ensures:
- Required fields are present
- Field types match expectations (string, URL format)
- DNS suffixes and URLs are in the correct format

### Phase 2: Runtime Validation

When the profile is loaded, it undergoes runtime validation:

```typescript
function validateCloudProfile(profile: CloudProfile): CloudProfile {
  // Check authorityHost is a valid absolute URL
  ensureAbsoluteUrl(profile.authorityHost, "authorityHost");
  
  // Check resourceManagerAudience is a valid absolute URL
  ensureAbsoluteUrl(profile.resourceManagerAudience, "resourceManagerAudience");
  
  // Check all DNS suffixes start with "."
  ensureDnsSuffix(profile.serviceDnsSuffixes.storage, "serviceDnsSuffixes.storage");
  // ... etc for all DNS suffixes
  
  // Check all service audiences are valid URLs
  ensureAbsoluteUrl(profile.serviceAudiences.arm, "serviceAudiences.arm");
  // ... etc
  
  return profile;
}
```

### Validation Rules

| Field | Rule |
|-------|------|
| `authorityHost` | Must be an absolute URL (e.g., `https://login.microsoftonline.com/`) ending with `/` |
| `resourceManagerEndpoint` | Must be an absolute URL ending with `/` |
| `resourceManagerAudience` | Must be an absolute URL ending with `/` |
| `serviceDnsSuffixes.*` | Must start with `.` (e.g., `.blob.core.windows.net`) |
| `serviceAudiences.*` | Must be an absolute URL ending with `/` |
| `name`, `displayName` | Must be non-empty strings |

{: .warning }
> **Invalid profiles will throw an error at startup**. For custom profiles, run validation in your CI/CD pipeline to catch errors before deployment.

## Resolution Order (in Detail)

The `resolveCloudProfile()` function follows this resolution order:

```typescript
export function resolveCloudProfile(options?: {
  customProfilePath?: string;  // 1st priority: explicit custom path
  name?: string;              // 2nd priority: explicit profile name
  env?: NodeJS.ProcessEnv;    // env vars
}): CloudProfile {
  const env = options?.env ?? process.env;
  
  // Priority 1: Custom path (highest precedence)
  const customProfilePath = 
    options?.customProfilePath ?? env.CUSTOM_CLOUD_PROFILE_PATH;
  if (customProfilePath) {
    return loadCloudProfileFromFile(customProfilePath);
  }
  
  // Priority 2: Named profile
  const requestedName = 
    options?.name ?? env.AZURE_CLOUD ?? "azure-us-government";
  
  if (!isSupportedCloudName(requestedName)) {
    throw new Error(`Unsupported AZURE_CLOUD "${requestedName}"`);
  }
  
  // Load built-in profile and apply env overrides
  return getBuiltinCloudProfile(requestedName, env);
}
```

### Resolution Examples

**Example 1: Default (no config)**
```
CUSTOM_CLOUD_PROFILE_PATH=
AZURE_CLOUD=
→ Resolves to: azure-us-government (hardcoded default)
```

**Example 2: Named built-in profile**
```
CUSTOM_CLOUD_PROFILE_PATH=
AZURE_CLOUD=azure-commercial
→ Resolves to: azure-commercial
```

**Example 3: Custom profile (highest priority)**
```
CUSTOM_CLOUD_PROFILE_PATH=/etc/sovereign-auth/my-azurestack.json
AZURE_CLOUD=azure-commercial
→ Resolves to: /etc/sovereign-auth/my-azurestack.json
   (AZURE_CLOUD is ignored)
```

**Example 4: Built-in + env overrides**
```
CUSTOM_CLOUD_PROFILE_PATH=
AZURE_CLOUD=azure-us-government
AZURE_AUTHORITY_HOST=https://login.custom.internal/
→ Resolves to: azure-us-government
   with authorityHost overridden to https://login.custom.internal/
```

## Auto-Detection of MSAL Instance Discovery

For private clouds (Azure Stack Hub, Secret/Top Secret enclaves), the application automatically detects whether MSAL instance discovery should be disabled. This is critical for air-gapped environments where MSAL cannot reach Microsoft's discovery endpoints.

The detection logic:

```typescript
// If authorityHost is not a well-known Microsoft endpoint, disable instance discovery
const wellKnownHosts = [
  "https://login.microsoftonline.com/",
  "https://login.microsoftonline.us/",
  // ... others for all commercial + government clouds
];

const shouldDisableInstanceDiscovery = !wellKnownHosts.includes(profile.authorityHost);
```

When creating credentials, instance discovery is automatically disabled for:
- Custom authority hosts (e.g., `https://adfs.azurestack.local/adfs/`)
- Secret enclave authorities (e.g., `https://login.secret.contoso.internal/`)
- Top Secret enclave authorities (e.g., `https://login.topsecret.contoso.internal/`)

{: .tip }
> You **do not** need to manually set `disableInstanceDiscovery` in credential factories. The app automatically detects private clouds and disables discovery accordingly.

## Best Practices

1. **For production Secret/Top Secret deployments**: Create custom profiles with real enclave endpoints instead of relying on placeholders.

2. **For Docker/Kubernetes deployments**: Use built-in profiles with environment variable overrides to avoid rebuilding images for different clouds.

3. **For multi-cloud support**: Store custom profiles in version control (without secrets) and use `CUSTOM_CLOUD_PROFILE_PATH` to select them at runtime.

4. **For air-gapped environments**: Avoid using the metadata endpoint (it requires internet). Use static profiles instead.

5. **For testing**: Override specific endpoints with env vars without creating new profile files.

6. **Validate early**: If you have custom profiles, validate them in CI/CD before deploying to production.

## Examples

### Using Azure Government

```bash
export AZURE_CLOUD=azure-us-government
npm start
```

### Using a Custom AzureStack Profile

```bash
export CUSTOM_CLOUD_PROFILE_PATH=./cloud-profiles/my-azurestack.json
npm start
```

### Overriding a Single Endpoint for Testing

```bash
export AZURE_CLOUD=azure-us-government
export AZURE_AUTHORITY_HOST=https://my-test-authority.internal/
npm start
```

### Loading from Code

```typescript
import { resolveCloudProfile } from "./src/config/cloudProfile";

// Use default resolution (env vars + built-in profiles)
const profile = resolveCloudProfile();

// Or explicitly specify a profile
const customProfile = resolveCloudProfile({
  customProfilePath: "./cloud-profiles/my-azurestack.json"
});

// Or use a built-in profile name
const govProfile = resolveCloudProfile({
  name: "azure-us-government"
});
```

## Schema Reference

The complete JSON schema for cloud profiles is available in `cloud-profiles/schema.json`. Validate custom profiles against this schema in your CI/CD pipeline:

```bash
npm install --save-dev ajv ajv-cli
ajv validate -s cloud-profiles/schema.json -d my-custom-profile.json
```

## See Also

- [Cloud Configuration](./docs/configuration.md) — Environment variable reference
- [Authentication](./docs/authentication.md) — How to authenticate against different Azure clouds
- [Deployment](./docs/deployment.md) — Deploying to Azure Government and air-gapped environments
