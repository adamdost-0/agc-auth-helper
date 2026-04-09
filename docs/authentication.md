---
title: Authentication
layout: default
nav_order: 4
---

# Authentication in Air-Gapped Clouds

This is the core challenge of sovereign cloud development: the Azure Identity SDKs assume they can reach Microsoft's public internet to validate your login authority. In air-gapped clouds, that assumption breaks everything.

This page explains **why**, shows **how the reference app solves it**, and provides **working code in all four Azure SDK languages**.

---

## Instance Discovery — Why It Breaks

When you create a credential with `@azure/identity` (or the Python, .NET, Go equivalents), MSAL performs **instance discovery** — a network call to validate your authority host against Microsoft's public directory.

```
Your app ──► MSAL ──► GET https://login.microsoft.com/common/discovery/instance
                      ?authorization_endpoint=https://{your-authority}/...
```

This works for three well-known authority hosts:

| Authority Host | Cloud |
|----------------|-------|
| `login.microsoftonline.com` | Azure Public |
| `login.microsoftonline.us` | Azure Government |
| `login.chinacloudapi.cn` | Azure China |

For **every other authority host** — Azure Stack Hub, Azure Government Secret, Azure Government Top Secret, or any custom cloud — this call fails because:

1. The authority host (e.g., `login.mystack.contoso.local`) is **not registered** with Microsoft's public directory
2. The network **cannot reach** `login.microsoft.com` to perform the validation
3. Even if it could, Microsoft's endpoint has no knowledge of enclave or on-premises authorities

The result: a cryptic MSAL error before your app ever attempts to authenticate.

> **The fix**: Set `disableInstanceDiscovery: true` on every credential constructor. This tells MSAL to skip the public validation and trust the authority host you provided.
{: .important }

---

## Per-Cloud Requirements

| Cloud | Authority Host | `disableInstanceDiscovery` | Why |
|-------|----------------|---------------------------|-----|
| Azure Public | `login.microsoftonline.com` | `false` (default) | Well-known host; discovery succeeds |
| Azure Government | `login.microsoftonline.us` | `false` (default) | Well-known host; discovery succeeds |
| Azure China | `login.chinacloudapi.cn` | `false` (default) | Well-known host; discovery succeeds |
| Azure Stack Hub | Custom (on-prem) | **`true`** | Not in public directory; network may be isolated |
| Azure Gov Secret (IL6) | Enclave-specific | **`true`** | Air-gapped; no public internet access |
| Azure Gov Top Secret (TS/SCI) | Enclave-specific | **`true`** | Air-gapped; no public internet access |
| Custom Cloud | User-provided | **`true`** | Unknown to public directory |

### Auto-detection logic

The reference app determines this automatically. If the authority host is one of the three well-known `AzureAuthorityHosts` values, instance discovery stays enabled. For everything else, it's disabled:

```typescript
// src/auth/credentialFactory.ts
import { AzureAuthorityHosts } from "@azure/identity";

export function shouldDisableInstanceDiscovery(authorityHost: string): boolean {
  const wellKnownHosts = new Set([
    AzureAuthorityHosts.AzurePublicCloud,   // "https://login.microsoftonline.com"
    AzureAuthorityHosts.AzureGovernment,     // "https://login.microsoftonline.us"
    AzureAuthorityHosts.AzureChina,          // "https://login.chinacloudapi.cn"
  ]);
  const normalized = authorityHost.replace(/\/+$/, "");
  return !wellKnownHosts.has(normalized as AzureAuthorityHosts);
}
```

> You don't need to configure this manually. The reference app reads the `authorityHost` from your cloud profile and auto-detects whether to disable instance discovery.
{: .tip }

---

## How the Reference App Handles It

The `createCredentialPlan()` function in [`src/auth/credentialFactory.ts`](https://github.com/adamdost-0/soverign-auth/blob/main/src/auth/credentialFactory.ts) applies the auto-detection to every credential that accepts the option:

```typescript
case "clientSecret": {
  const credential = new ClientSecretCredential(
    requireEnv("AZURE_TENANT_ID", env),
    requireEnv("AZURE_CLIENT_ID", env),
    requireEnv("AZURE_CLIENT_SECRET", env),
    {
      authorityHost: profile.authorityHost,
      disableInstanceDiscovery: shouldDisableInstanceDiscovery(profile.authorityHost),
    },
  );
  // ...
}
```

The same pattern applies to `WorkloadIdentityCredential` and `DeviceCodeCredential`. Each receives `authorityHost` from the cloud profile and the computed `disableInstanceDiscovery` value.

Two credential types are **exempt**:

- **`ManagedIdentityCredential`** — Uses IMDS or platform-specific token endpoints, never contacts an authority host directly
- **`AzureCliCredential`** — Delegates authority handling to the Azure CLI, which manages its own cloud configuration via `az cloud set`

---

## Code Examples — All Four Languages

The following examples use Azure Stack Hub placeholder URLs. Replace them with your actual cloud endpoints — the pattern is identical for Azure Government Secret, Top Secret, or any custom cloud.

### TypeScript

```typescript
import { ClientSecretCredential } from "@azure/identity";

const credential = new ClientSecretCredential(tenantId, clientId, secret, {
  authorityHost: "https://login.mystack.contoso.local/",
  disableInstanceDiscovery: true,
});

// Acquire a token for the ARM audience (with /.default scope suffix)
const token = await credential.getToken(
  "https://management.mystack.contoso.local/.default"
);
```

### Python

```python
from azure.identity import ClientSecretCredential

credential = ClientSecretCredential(
    tenant_id=tenant_id,
    client_id=client_id,
    client_secret=secret,
    authority="https://login.mystack.contoso.local/",
    disable_instance_discovery=True,
)

token = credential.get_token(
    "https://management.mystack.contoso.local/.default"
)
```

> In the Python SDK, the parameter is `authority` (not `authority_host`) and `disable_instance_discovery` uses snake_case. Internally, MSAL Python stores this as `instance_discovery = not disable_instance_discovery`.
{: .note }

### C# (.NET)

```csharp
using Azure.Identity;

var options = new ClientSecretCredentialOptions
{
    AuthorityHost = new Uri("https://login.mystack.contoso.local/"),
    DisableInstanceDiscovery = true,
};

var credential = new ClientSecretCredential(tenantId, clientId, secret, options);

var context = new TokenRequestContext(
    new[] { "https://management.mystack.contoso.local/.default" }
);
var token = await credential.GetTokenAsync(context);
```

### Go

```go
import (
    "github.com/Azure/azure-sdk-for-go/sdk/azidentity"
    "github.com/Azure/azure-sdk-for-go/sdk/azcore/cloud"
)

opts := azidentity.ClientSecretCredentialOptions{}
opts.Cloud = cloud.Configuration{
    ActiveDirectoryAuthorityHost: "https://login.mystack.contoso.local/",
}
opts.DisableInstanceDiscovery = true

cred, err := azidentity.NewClientSecretCredential(
    tenantID, clientID, secret, &opts,
)

// Use the ARM audience as the scope
token, err := cred.GetToken(context.TODO(), policy.TokenRequestOptions{
    Scopes: []string{"https://management.mystack.contoso.local/.default"},
})
```

> The Go SDK uses `cloud.Configuration` to set the authority host — the `Cloud` field on credential options. This is the same `cloud` package used by the Azure SDK service clients for endpoint configuration.
{: .note }

---

## Credential Type Matrix

Not all credential types interact with authority hosts the same way. Use this matrix to understand what's needed for each:

| Credential Type | `authorityHost` | `disableInstanceDiscovery` | Air-Gap Notes |
|----------------|:---:|:---:|---------------|
| `ClientSecretCredential` | ✅ | ✅ | Full support. Set both for custom clouds. |
| `ClientCertificateCredential` | ✅ | ✅ | Same pattern as ClientSecret. |
| `WorkloadIdentityCredential` | ✅ | ✅ | Used in Kubernetes with federated tokens. |
| `DeviceCodeCredential` | ✅ | ✅ | Interactive. User must access the custom authority URL. |
| `UsernamePasswordCredential` | ✅ | ✅ | Supported but discouraged for production. |
| `DefaultAzureCredential` | ✅ | ✅ | Chains multiple credentials; applies the flag to the chain. |
| `ManagedIdentityCredential` | — | — | Uses IMDS (`169.254.169.254`) or platform token endpoints. No authority host needed. |
| `AzureCliCredential` | — | — | Handled by `az cloud set`. CLI manages authority internally. |

> `ManagedIdentityCredential` works in air-gapped clouds without any special configuration — it contacts the local IMDS endpoint or the platform's managed identity service, not an external authority. The scope/resource parameter still must match the enclave's ARM audience.
{: .tip }

---

## ADFS Support on Azure Stack Hub

Azure Stack Hub deployments can use either **Microsoft Entra ID** or **Active Directory Federation Services (ADFS)** as their identity provider.

When ADFS is the identity provider, set `tenantId` to the literal string `"adfs"`. The Azure Identity SDK treats this as a special case and **implicitly disables instance discovery**:

```typescript
// From the SDK source (msal/utils.ts — getKnownAuthorities):
if ((tenantId === "adfs" && authorityHost) || disableInstanceDiscovery) {
  return [authorityHost];  // Skip instance discovery
}
return [];
```

This means that with ADFS, you can omit `disableInstanceDiscovery: true` — the SDK infers it from the tenant ID:

```typescript
const credential = new ClientSecretCredential(
  "adfs",                    // tenantId — triggers implicit disable
  clientId,
  secret,
  {
    authorityHost: "https://adfs.mystack.contoso.local/adfs",
  },
);
```

> For clarity and forward compatibility, the reference app still sets `disableInstanceDiscovery: true` explicitly even when `tenantId` is `"adfs"`. Explicit is better than implicit.
{: .note }

> Azure Government Secret and Top Secret enclaves always use **Entra ID** (not ADFS). The `"adfs"` tenant ID shortcut applies only to Azure Stack Hub deployments.
{: .warning }

---

## Dynamic Audience Discovery

Hardcoding ARM audiences works, but Azure Stack Hub (and other custom clouds) expose a **metadata endpoint** that returns the correct audience at runtime. This is the recommended approach for production deployments where audiences may change.

### The metadata request

```bash
GET https://management.mystack.contoso.local/metadata/endpoints?api-version=2015-01-01
```

### Response shape

```json
{
  "galleryEndpoint": "https://adminportal.mystack.contoso.local:30015/",
  "graphEndpoint": "https://graph.windows.net/",
  "authentication": {
    "loginEndpoint": "https://login.mystack.contoso.local/",
    "audiences": [
      "https://management.mystack.contoso.local/"
    ]
  },
  "portalEndpoint": "https://portal.mystack.contoso.local/"
}
```

### Using the discovered audience

The `authentication.audiences[0]` value is your ARM audience. Append `/.default` to form the scope:

```typescript
async function discoverArmAudience(armEndpoint: string): Promise<string> {
  const metadataUrl = new URL(
    "/metadata/endpoints?api-version=2015-01-01",
    armEndpoint,
  );

  const response = await fetch(metadataUrl);
  const metadata = await response.json();

  // Returns e.g. "https://management.mystack.contoso.local/"
  return metadata.authentication.audiences[0];
}

// Usage:
const audience = await discoverArmAudience(profile.resourceManagerEndpoint);
const token = await credential.getToken(`${audience}.default`);
```

> The metadata endpoint does not require authentication — it's a public (within the network) discovery endpoint. This same pattern works on Azure Government Secret and Top Secret enclaves at their respective ARM endpoints.
{: .tip }

> The reference app stores the ARM audience in the cloud profile's `resourceManagerAudience` field. For Azure Stack deployments, you can populate this dynamically from the metadata endpoint during startup, or set it statically in the profile JSON.
{: .note }

---

## Azure CLI Cloud Registration

When using `AzureCliCredential`, the Azure CLI must know about your custom cloud. Register it before running `az login`:

```bash
# Register your custom cloud
az cloud register -n MyStack \
  --endpoint-resource-manager "https://management.mystack.contoso.local/" \
  --suffix-storage-endpoint ".mystack.contoso.local" \
  --suffix-keyvault-dns ".vault.mystack.contoso.local"

# Set it as the active cloud
az cloud set --name MyStack

# Login against the custom cloud
az login
```

After registration, `AzureCliCredential` uses the CLI's cloud configuration automatically — no `authorityHost` or `disableInstanceDiscovery` needed in your application code:

```typescript
import { AzureCliCredential } from "@azure/identity";

// CLI already knows the cloud — no special options needed
const credential = new AzureCliCredential({
  tenantId: process.env.AZURE_TENANT_ID,
});
```

### Pre-registered clouds

The Azure CLI includes several clouds out of the box:

| CLI Cloud Name | Environment |
|----------------|-------------|
| `AzureCloud` | Azure Public |
| `AzureUSGovernment` | Azure Government |
| `AzureChinaCloud` | Azure China |

For Azure Government, you only need `az cloud set --name AzureUSGovernment` — no registration required.

> For Azure Stack Hub, Government Secret, and Top Secret — the cloud must be explicitly registered with `az cloud register` using the correct endpoints for your environment.
{: .important }

### Listing and verifying cloud registrations

```bash
# List all registered clouds
az cloud list --output table

# Show the active cloud's endpoints
az cloud show --output json
```

---

## SDK Internals — How It Works Under the Hood

Understanding the internal flow helps debug authentication issues in air-gapped environments:

```
┌──────────────────────────────────────────────────────────────────┐
│  Application Code                                                │
│  credential = new ClientSecretCredential(tenantId, clientId,     │
│    secret, { authorityHost, disableInstanceDiscovery: true })    │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  @azure/identity                                                 │
│                                                                  │
│  1. getAuthorityHost(options)                                    │
│     → options.authorityHost ?? AZURE_AUTHORITY_HOST env var      │
│     → fallback: "https://login.microsoftonline.com"              │
│                                                                  │
│  2. getKnownAuthorities(tenantId, authority, disableDiscovery)   │
│     → if disableDiscovery: return [authorityHost]                │
│     → else: return [] (MSAL validates against public endpoint)   │
│                                                                  │
│  3. createMsalClient()                                           │
│     → MSAL config: auth.knownAuthorities = [authorityHost]      │
│     → Skips instance discovery, trusts the provided authority    │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│  MSAL (@azure/msal-node)                                         │
│                                                                  │
│  POST {authorityHost}/{tenantId}/oauth2/v2.0/token               │
│  Body: client_id, client_secret, scope={audience}/.default       │
│                                                                  │
│  Returns: { access_token, expires_in, ... }                      │
└──────────────────────────────────────────────────────────────────┘
```

When `disableInstanceDiscovery` is `true`, MSAL adds your authority host to its `knownAuthorities` list. This tells MSAL to trust it without validation — the token request goes directly to `{authorityHost}/{tenantId}/oauth2/v2.0/token`.

---

## Troubleshooting

### "Authority host validation failed"

**Cause**: Instance discovery is enabled (default) but your authority host isn't one of the three well-known hosts.

**Fix**: Set `disableInstanceDiscovery: true` in your credential options.

### "Network request failed" during credential creation

**Cause**: MSAL is trying to reach `login.microsoft.com` for instance discovery, but the network is air-gapped.

**Fix**: Set `disableInstanceDiscovery: true`. The error occurs before any token request because instance discovery happens during the first `getToken()` call.

### Token acquired but API calls return 401

**Cause**: The token audience doesn't match what the target service expects. This often happens when the ARM audience is hardcoded to the public cloud value.

**Fix**: Use the audience from your cloud profile's `resourceManagerAudience` or discover it dynamically from the metadata endpoint. Ensure you append `/.default` to form the scope.

### "AADSTS50049: Unknown or invalid instance"

**Cause**: Your authority host URL is malformed or the Entra ID / ADFS endpoint isn't responding at that address.

**Fix**: Verify the authority host URL is correct and reachable from your network. Check for trailing slashes — the SDK normalizes them, but some proxies don't.

> When debugging authentication in air-gapped environments, enable SDK logging by setting `AZURE_LOG_LEVEL=verbose`. This surfaces the exact URLs MSAL is trying to reach.
{: .tip }
