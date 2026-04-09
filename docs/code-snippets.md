---
title: Code Snippets
layout: default
nav_order: 5
---

# Code Snippets

Quick-reference code for making `azure-identity` work with Azure Stack Hub, Azure Government Secret, and Azure Government Top Secret.

---

## The One Thing You Must Know

```typescript
// This is the ONLY change needed for private clouds
const credential = new ClientSecretCredential(tenantId, clientId, secret, {
  authorityHost: "https://login.your-private-cloud.local/",
  disableInstanceDiscovery: true,  // ← This is the key
});
```

> **Why?** Without `disableInstanceDiscovery: true`, MSAL tries to validate your authority host against `login.microsoft.com` — which fails in air-gapped networks.

---

## TypeScript / Node.js

### Client Secret

```typescript
import { ClientSecretCredential } from "@azure/identity";

const credential = new ClientSecretCredential(
  "your-tenant-id",
  "your-client-id",
  "your-client-secret",
  {
    authorityHost: "https://login.your-stack.contoso.local/",
    disableInstanceDiscovery: true,
  }
);

// Request a token with the ARM audience for your cloud
const token = await credential.getToken(
  "https://management.your-stack.contoso.local/.default"
);
```

### Workload Identity (Kubernetes)

```typescript
import { WorkloadIdentityCredential } from "@azure/identity";

const credential = new WorkloadIdentityCredential({
  tenantId: process.env.AZURE_TENANT_ID,
  clientId: process.env.AZURE_CLIENT_ID,
  tokenFilePath: process.env.AZURE_FEDERATED_TOKEN_FILE,
  authorityHost: "https://login.your-stack.contoso.local/",
  disableInstanceDiscovery: true,
});
```

### Device Code (Interactive)

```typescript
import { DeviceCodeCredential } from "@azure/identity";

const credential = new DeviceCodeCredential({
  tenantId: "your-tenant-id",
  clientId: "your-client-id",
  authorityHost: "https://login.your-stack.contoso.local/",
  disableInstanceDiscovery: true,
  userPromptCallback: (info) => console.log(info.message),
});
```

### Managed Identity (No Changes Needed)

```typescript
import { ManagedIdentityCredential } from "@azure/identity";

// Managed Identity uses IMDS — NOT an authority host.
// No disableInstanceDiscovery needed.
const credential = new ManagedIdentityCredential();

// But you still need the correct audience for your cloud:
const token = await credential.getToken(
  "https://management.your-stack.contoso.local/.default"
);
```

### Auto-Detection (This Repo's Pattern)

From [`src/auth/credentialFactory.ts`](https://github.com/adamdost-0/soverign-auth/blob/main/src/auth/credentialFactory.ts):

```typescript
import { AzureAuthorityHosts } from "@azure/identity";

function shouldDisableInstanceDiscovery(authorityHost: string): boolean {
  const wellKnown = new Set([
    AzureAuthorityHosts.AzurePublicCloud,    // login.microsoftonline.com
    AzureAuthorityHosts.AzureGovernment,     // login.microsoftonline.us
    AzureAuthorityHosts.AzureChina,          // login.chinacloudapi.cn
  ]);
  return !wellKnown.has(authorityHost.replace(/\/+$/, ""));
}

// Use it:
const credential = new ClientSecretCredential(tenantId, clientId, secret, {
  authorityHost: profile.authorityHost,
  disableInstanceDiscovery: shouldDisableInstanceDiscovery(profile.authorityHost),
});
```

---

## Python

```python
from azure.identity import ClientSecretCredential

credential = ClientSecretCredential(
    tenant_id="your-tenant-id",
    client_id="your-client-id",
    client_secret="your-client-secret",
    authority="https://login.your-stack.contoso.local",
    disable_instance_discovery=True,
)

token = credential.get_token(
    "https://management.your-stack.contoso.local/.default"
)
```

---

## .NET (C#)

```csharp
using Azure.Identity;

var options = new ClientSecretCredentialOptions
{
    AuthorityHost = new Uri("https://login.your-stack.contoso.local/"),
    DisableInstanceDiscovery = true,
};

var credential = new ClientSecretCredential(
    "your-tenant-id",
    "your-client-id",
    "your-client-secret",
    options
);

var token = await credential.GetTokenAsync(
    new Azure.Core.TokenRequestContext(
        new[] { "https://management.your-stack.contoso.local/.default" }
    )
);
```

---

## Go

```go
import (
    "github.com/Azure/azure-sdk-for-go/sdk/azidentity"
    "github.com/Azure/azure-sdk-for-go/sdk/azcore/cloud"
)

opts := azidentity.ClientSecretCredentialOptions{}
opts.Cloud = cloud.Configuration{
    ActiveDirectoryAuthorityHost: "https://login.your-stack.contoso.local/",
}
opts.DisableInstanceDiscovery = true

cred, err := azidentity.NewClientSecretCredential(
    "your-tenant-id",
    "your-client-id",
    "your-client-secret",
    &opts,
)
```

---

## Azure CLI

```bash
# Register your private cloud
az cloud register -n MyPrivateCloud \
  --endpoint-resource-manager "https://management.your-stack.contoso.local/" \
  --suffix-storage-endpoint "your-stack.contoso.local" \
  --suffix-keyvault-dns ".vault.your-stack.contoso.local"

# Set it as active
az cloud set --name MyPrivateCloud

# Login
az login --tenant your-tenant-id

# Verify
az account show
```

---

## Discovering Your Cloud's ARM Audience

```bash
# Query the ARM metadata endpoint (no auth required)
curl -s "https://management.your-stack.contoso.local/metadata/endpoints?api-version=2015-01-01" | jq .

# Response includes:
# {
#   "authentication": {
#     "loginEndpoint": "https://login.your-stack.contoso.local/",
#     "audiences": ["https://management.your-stack.contoso.local/"]
#   }
# }
```

Use `authentication.audiences[0]` as your token scope (append `/.default`).

---

## Quick Reference Table

| What | Where to set it | Example |
|------|----------------|---------|
| Authority host | `authorityHost` option | `https://login.your-stack.contoso.local/` |
| Instance discovery | `disableInstanceDiscovery: true` | Required for non-public clouds |
| ARM audience | Token scope parameter | `https://management.your-stack.contoso.local/.default` |
| ARM endpoint | HTTP client base URL | `https://management.your-stack.contoso.local/` |
| Storage DNS | Service DNS suffix | `.blob.storage.your-stack.contoso.local` |
| Key Vault DNS | Service DNS suffix | `.vault.your-stack.contoso.local` |
