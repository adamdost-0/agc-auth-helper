---
title: Air-Gap Patterns
layout: default
nav_order: 5
---

# Air-Gap Patterns

{: .no_toc }

## Table of contents

{: .no_toc .text-delta }

- TOC
{:toc}

---

## What is an air-gapped Azure environment?

An **air-gapped Azure environment** is a sovereign cloud deployment with **zero internet access** — either physically isolated or logically segmented from public networks. These environments are used for the most sensitive workloads in the U.S. government:

- **Azure Government Secret (IL6)** — Classified information at the Secret level per DoD SRG IL6
- **Azure Government Top Secret (TS/SCI)** — Compartmentalized information at the Top Secret level
- **Azure Stack Hub (disconnected mode)** — On-premises Azure runtime with no public cloud connectivity

### Key characteristics

- **No internet access**: Cannot download packages, pull container images, or reach external endpoints
- **Pre-staged dependencies**: All code, packages, container images, and tools must be transferred through approved cross-domain solutions (USB drives, isolated transfer zones, air-gapped CI/CD)
- **Internal services only**: DNS, package registries, container registries, NTP, CRL/OCSP endpoints — all run internally
- **Compliance-first networking**: Private endpoints for all PaaS services, no public IPs, internal PKI for TLS

The sovereign-auth reference app uses **private endpoints, managed identity, and Azure Government profiles** to prepare for deployment in these environments.

---

## Package management in air-gapped environments

In air-gapped clouds, npm cannot reach public registries like npmjs.com. All dependencies must be resolved **on a connected machine**, packaged, and transferred securely to the air-gapped side.

### npm in air-gapped environments

#### Step 1: Resolve dependencies on a connected machine

On a machine with internet access, resolve the full dependency tree and lock it:

```bash
npm ci  # Install from package-lock.json
```

This produces `package-lock.json` with **all transitive dependencies pinned** to exact versions and download URLs.

#### Step 2: Configure internal registry

In the air-gapped environment, point npm to an **internal Verdaccio, Artifactory, or Nexus** registry. The repo provides `.npmrc.example`:

```ini
registry=${NPM_REGISTRY_URL}
always-auth=true
```

Set the registry URL in your environment or `.npmrc`:

```bash
export NPM_REGISTRY_URL=https://verdaccio.internal.azuregov.us/
# or directly in .npmrc:
# registry=https://verdaccio.internal.azuregov.us/
```

#### Step 3: Transfer and install packages

Transfer `package-lock.json` (and optionally cached `node_modules` as a `.tar.gz` file) through an approved transfer mechanism:

```bash
# On connected side: cache dependencies
npm pack    # (creates .tgz for each package)
tar czf dependencies.tar.gz node_modules/

# On air-gapped side: restore from cache or registry
npm ci --offline  # if you transferred node_modules
# or
npm ci             # if you're pulling from internal registry
```

#### Best practice workflow

```
┌─ Connected Machine ──────────┐      ┌─ Air-Gapped Network ────┐
│ npm ci                       │      │                         │
│ npm pack (all deps)          │ ────→│ Upload to Verdaccio    │
│ tar czf node_modules.tar.gz  │      │ npm ci (from registry) │
└──────────────────────────────┘      └─────────────────────────┘
```

### General dependency management

**For all languages** (npm, pip, NuGet, Go modules, Maven, Gradle):

1. **On connected side**: Resolve full transitive dependency tree with lock files
2. **Scan and approve**: Vulnerability-scan all artifacts (SBOM, trivy, or equivalent)
3. **Transfer via approved solution**: USB, Azure Relay, dedicated transfer zone
4. **On air-gapped side**: Restore from internal mirror or cached archives

### Private registry mirrors

Set up internal mirrors for each language:

| Language | Tool | Registry |
|----------|------|----------|
| npm | Verdaccio, Artifactory, Nexus | `npm config set registry https://verdaccio.internal/` |
| pip | devpi, Nexus, Artifactory | `pip config set global.index-url https://pypi.internal/` |
| NuGet | Azure Artifacts, Nexus, Artifactory | Configure in `nuget.config` |
| Go | Athens, GoCenter mirror | `export GOPROXY=https://proxy.golang.internal/` |

---

## Container images

In air-gapped environments, you cannot pull from **Docker Hub**, **Microsoft Container Registry (MCR)**, or **GitHub Container Registry**. All images must come from a **private Azure Container Registry (ACR)** within the air-gapped network.

### Private ACR endpoints

Use the correct ACR DNS suffix for your sovereign cloud:

- **Azure Government**: `.azurecr.us` (e.g., `myregistry.azurecr.us`)
- **Azure Gov Secret**: `.azurecr.{enclave-id}` (custom DNS)
- **Azure Gov Top Secret**: `.azurecr.{enclave-id}` (custom DNS)
- **Azure Stack Hub**: `{registry}.{azurestack-domain}:5000` (typically on-premises)

### Dockerfile and image references

**❌ DON'T** reference public registries:

```dockerfile
# ❌ WRONG - public registry, will fail in air-gap
FROM node:20-lts
FROM mcr.microsoft.com/dotnet/aspnet:8
```

**✅ DO** use private ACR with digest-pinned references:

```dockerfile
# ✅ CORRECT - private ACR, digest-pinned, specific version
FROM myregistry.azurecr.us/node:20-lts@sha256:abc123def456...
FROM myregistry.azurecr.us/dotnet:8.0@sha256:xyz789abc123...
```

### Transferring base images to private ACR

#### Transfer using `skopeo` (recommended)

```bash
# On connected machine
skopeo copy docker://node:20-lts \
  docker-archive:/tmp/node-20.tar

# Transfer /tmp/node-20.tar through approved channel

# On air-gapped machine
skopeo copy docker-archive:/tmp/node-20.tar \
  docker://myregistry.azurecr.us/node:20-lts
```

#### Transfer using `crane`

```bash
# On connected machine
crane pull node:20-lts node-20.tar
crane push node-20.tar myregistry.azurecr.us/node:20-lts
```

#### Bulk import using `az acr import`

If your ACR can reach a staging registry:

```bash
az acr import \
  --registry myregistry \
  --source mcr.microsoft.com/dotnet/aspnet:8 \
  --image dotnet:8.0 \
  --password <access-key>
```

### Image tagging and digest pinning

Always use **digest-pinned references** in production to guarantee immutability:

```bash
# Get the digest
DIGEST=$(docker inspect --format='{{index .RepoDigests 0}}' myregistry.azurecr.us/node:20-lts)

# Use in Dockerfile or deployment manifest
echo "FROM ${DIGEST}"
```

In Kubernetes manifests or Helm values:

```yaml
# values.yaml
image:
  repository: myregistry.azurecr.us/sovereign-auth
  tag: "1.0.0"
  # Always include digest for air-gapped environments
  digest: "sha256:abc123def456..."

# Or combined as image pull:
imagePolicy:
  - myregistry.azurecr.us/sovereign-auth@sha256:abc123def456...
```

### Kubernetes system images

When deploying **AKS in an air-gapped environment**, you must pre-stage all system images in your private ACR:

- `pause` (pause container)
- `coredns` (DNS)
- `metrics-server` (metrics)
- `azure-cni-networkmonitor` (Azure networking)
- `azure-npm` (Azure Policy for Kubernetes)

Transfer these to your private ACR before cluster creation.

---

## DNS and certificates

Air-gapped environments cannot use public DNS services (8.8.8.8) or external certificate authorities (Let's Encrypt). All resolution and certificate issuance must happen internally.

### Internal DNS servers

Configure all VMs, containers, and services to use **internal DNS servers only**:

```bash
# On Linux VMs or containers
echo "nameserver 10.42.10.10" > /etc/resolv.conf  # Internal DNS IP

# In Azure VNET
# Set the custom DNS servers in the VNET DNS settings
```

### Split-DNS model (hybrid environments)

For environments that bridge on-prem and cloud:

```
On-Premises                     Azure Cloud
└─ internal.corp                └─ internal.azuregov.us
   ├─ dns.internal                 ├─ storage.internal
   │  (resolves to 192.168.x.x)    │  (resolves to 10.42.x.x via private endpoint)
   └─ corp.local                   └─ keyvault.internal
                                      (resolves to 10.42.x.x via private endpoint)
```

Use conditional forwarders in on-premises DNS to route cloud queries to Azure internal DNS.

### Internal PKI and certificate issuance

**Never use Let's Encrypt or public CAs.** Deploy an internal PKI:

#### Option 1: Windows Server Active Directory Certificate Services (ADCS)

```powershell
# Deploy ADCS for internal TLS certificate issuance
Install-AdcsCertificationAuthority -CAType EnterpriseRootCA
```

#### Option 2: HashiCorp Vault or CFSSL

```bash
# Example: CFSSL configuration for internal CA
cfssl genkey -initca ca-config.json | cfssljson -bare ca
```

### CRL and OCSP endpoints

Mirror **Certificate Revocation Lists (CRL)** and **Online Certificate Status Protocol (OCSP)** endpoints internally:

```bash
# Fetch CRL from public side
curl -o /internal/crl/ca.crl \
  http://crl.microsoft.com/pki/crl/products/MicrosoftITTLSCA.crl

# Serve internally via web server or Azure Storage with private endpoint
# Update system CRL cache
update-ca-certificates --fresh
```

### CoreDNS in AKS (Kubernetes)

Configure **CoreDNS** to use internal upstream resolvers:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: coredns
  namespace: kube-system
data:
  Corefile: |
    .:53 {
        errors
        health {
           lameduck 5s
        }
        ready
        # Use internal DNS servers as upstream
        forward . 10.42.10.10 10.42.10.11 {
           prefer_udp
        }
        cache 30
        loop
        reload
        loadbalance
    }
```

---

## CI/CD for air-gapped environments

### Architecture overview

Air-gapped CI/CD uses a **unidirectional transfer model**: code and artifacts flow from the connected (unclassified) side to the air-gapped (classified) side through an approved transfer mechanism.

```
UNCLASSIFIED SIDE          SECURE TRANSFER           AIR-GAPPED SIDE
─────────────────────      ────────────────          ──────────────────
GitHub.com / ADO                                    GHES / ADO Server
Public registries    ──→  USB / DVD / Diode  ──→   Private ACR / Nexus
Build (CI)               Approved artifacts        Deploy (CD)
Public runners           Images, Charts,            Self-hosted runners
                         Packages, Code
```

### Self-hosted runners on air-gapped side

GitHub Actions and Azure DevOps Pipelines require **self-hosted runners** to execute jobs in the air-gapped environment:

#### GitHub (GHES - GitHub Enterprise Server)

```bash
# On the air-gapped runner machine
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64.tar.gz \
  https://github.enterprise.internal/api/v3/repos/actions/runner/releases/latest/download/actions-runner-linux-x64.tar.gz
tar xzf actions-runner-linux-x64.tar.gz
./config.sh --url https://github.enterprise.internal/your-org --token YOUR_TOKEN --runnergroup air-gapped
./run.sh
```

#### Azure DevOps (Server or Cloud)

```bash
mkdir azagent && cd azagent
curl -o vsts-agent.tar.gz \
  https://vstsagentpackage.azureedge.net/agent/3.227.2/vsts-agent-linux-x64-3.227.2.tar.gz
tar xzf vsts-agent.tar.gz
./config.sh --unattended --url https://dev.azure.us --auth pat --token YOUR_PAT
./runsvc.sh
```

### Pin all versions explicitly

**Never** use floating tags like `@latest` in CI/CD pipeline definitions:

```yaml
# ❌ WRONG - floating tag, may pull different versions
- uses: actions/checkout@latest
- uses: azure/login@latest

# ✅ CORRECT - pinned version
- uses: actions/checkout@v4
- uses: azure/login@v1.6.0
```

For Azure DevOps Pipelines:

```yaml
# ❌ WRONG
- task: AzureCLI@latest
  inputs:
    azureSubscription: 'my-subscription'

# ✅ CORRECT
- task: AzureCLI@2.239.0
  inputs:
    azureSubscription: 'my-subscription'
```

### Pre-download Terraform providers

When using Terraform in air-gapped environments, pre-download all providers using `terraform providers mirror`:

```bash
# On connected machine
terraform init
terraform providers mirror /tmp/terraform-providers/

# Transfer the providers directory through approved channel
tar czf terraform-providers.tar.gz /tmp/terraform-providers/

# On air-gapped machine
tar xzf terraform-providers.tar.gz -C ~/.terraform.d/plugins/

# Set provider cache dir in Terraform
export TF_PLUGIN_CACHE_DIR=~/.terraform.d/plugins/
terraform init -backend-config="..."
```

For fully disconnected environments, use **`.terraform/providers/`** local caching:

```hcl
terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "= 3.75.0"
    }
  }
}
```

---

## Network architecture

Air-gapped deployments require careful network design to maintain security and compliance. The sovereign-auth infrastructure uses several patterns from `infra/main.bicep`.

### Hub-and-spoke topology

```
┌──────────────────────────────────────────┐
│        Azure Firewall (HUB)              │
│    Centralized egress + filtering        │
└──────────────────────────────────────────┘
         │           │           │
    ┌────┴────┐  ┌──┴───┐  ┌────┴────┐
    │          │  │      │  │         │
  SPOKE-1   SPOKE-2   SPOKE-3
  (Dev)     (Staging) (Prod)
  ├─ App    ├─ App    ├─ App
  ├─ DB     ├─ DB     ├─ DB
  ├─ KV     ├─ KV     └─ KV
```

All VNet-to-VNet traffic routes through the hub firewall for centralized egress control.

### Private endpoints for all PaaS services

The reference Bicep template (`infra/main.bicep`) implements **private endpoints for**:

- **Azure Storage** (`Microsoft.Storage/storageAccounts`)
- **Azure Key Vault** (`Microsoft.KeyVault/vaults`)
- **App Service** web apps

Each private endpoint:

```bicep
resource storagePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: 'pe-storage-${shortSuffix}'
  properties: {
    subnet: { id: privateEndpointSubnetId }
    privateLinkServiceConnections: [{
      name: 'storage-blob-connection'
      properties: {
        privateLinkServiceId: storageAccount.id
        groupIds: ['blob']
      }
    }]
  }
}
```

Maps to a **private DNS zone**:

```bicep
resource blobPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: blobPrivateDnsZoneName  // e.g., privatelink.blob.core.usgovcloudapi.net
  location: 'global'
}
```

### Network Security Groups (NSGs) for micro-segmentation

Define NSGs to restrict traffic between subnets:

```bicep
resource appNSG 'Microsoft.Network/networkSecurityGroups@2023-11-01' = {
  name: 'nsg-app-${environment}'
  properties: {
    securityRules: [
      {
        name: 'AllowAppServiceToStorage'
        properties: {
          access: 'Allow'
          direction: 'Outbound'
          sourcePortRange: '*'
          destinationPortRange: '443'
          protocol: 'Tcp'
          sourceAddressPrefix: '10.42.1.0/24'    // app subnet
          destinationAddressPrefix: '10.42.2.0/24' // private endpoints subnet
        }
      }
    ]
  }
}
```

### No public IPs or internet-facing endpoints

The reference template sets:

```bicep
properties: {
  publicNetworkAccess: 'Disabled'  // App Service
  httpsOnly: true
  virtualNetworkSubnetId: appSubnetId  // App Service delegated to VNet
}
```

All resources are accessible **only via private endpoints** or **internal IP addresses**.

---

## Compliance checklist

Use this checklist when preparing infrastructure for air-gapped deployment:

### Network & Access

- [ ] **Private endpoints enabled** for all PaaS services (Storage, Key Vault, SQL, ACR, App Service)
- [ ] **Public network access disabled** on all PaaS resources (`publicNetworkAccess: 'Disabled'`)
- [ ] **No public IP addresses** on any compute or networking resources
- [ ] **NSGs configured** for micro-segmentation between subnets
- [ ] **Azure Firewall** or equivalent egress filtering in hub VNet
- [ ] **All DNS queries use internal DNS servers** (not 8.8.8.8 or public resolvers)

### Authentication & Secrets

- [ ] **Managed Identity enabled** for service-to-service authentication
  - [ ] App Service using **SystemAssigned** or **UserAssigned** identity
  - [ ] No connection strings or hardcoded credentials in code or configs
- [ ] **Key Vault configured** for all secrets and certificates
  - [ ] **RBAC authorization enabled** (`enableRbacAuthorization: true`)
  - [ ] **Soft delete + purge protection enabled**
  - [ ] **Private endpoint** configured for Key Vault access

### Encryption

- [ ] **CMK (Customer-Managed Keys) for encryption at rest** (if supported by service)
  - [ ] Storage encryption via Key Vault
  - [ ] Database encryption via Key Vault
- [ ] **TLS 1.2 minimum** for all connections (`minimumTlsVersion: 'TLS1_2'`)
- [ ] **HTTPS only** (HTTP endpoints disabled)
- [ ] **Internal PKI** for TLS certificates (no Let's Encrypt or external CAs)

### Logging & Monitoring

- [ ] **Diagnostic settings enabled** on all resources
  - [ ] Send logs to Log Analytics Workspace
  - [ ] Retention set appropriately (e.g., 30+ days)
- [ ] **Activity logs** captured for audit trail

### Tags & Metadata

- [ ] **Environment tag** applied (`dev`, `staging`, `prod`)
- [ ] **ManagedBy tag** applied (`bicep`, `terraform`, etc.)
- [ ] **Project tag** applied (project name)
- [ ] **Owner tag** applied (team or individual)
- [ ] **Classification tag** applied (`CUI`, `Secret`, `TopSecret`)
- [ ] **Compliance tag** applied (`FedRAMP-High`, `IL4`, `IL5`, `IL6`)

### Container & Dependency Management

- [ ] **All container images from private ACR** (`.azurecr.us` or equivalent)
- [ ] **Images digest-pinned** (`image@sha256:...`), not `:latest` tags
- [ ] **Helm charts** reference internal ACR for all images
- [ ] **All npm/pip/NuGet packages** from internal registries
- [ ] **No public registries** referenced (npmjs.com, hub.docker.com, etc.)
- [ ] **Terraform providers pre-downloaded** via `terraform providers mirror`

### Access Control

- [ ] **RBAC configured** at narrowest scope
  - [ ] Storage Blob Data Reader only for read operations
  - [ ] Key Vault Secrets User only for secret access
  - [ ] No Owner or Contributor roles at resource level
- [ ] **Azure Policy enabled** for guardrails
- [ ] **MFA required** for human access
- [ ] **Service principals scoped** to specific resources

### Government cloud configuration

- [ ] **Azure Government endpoints used** (`.usgovcloudapi.net`)
- [ ] **Government cloud profile** set in app config (`AZURE_CLOUD=azure-us-government`)
- [ ] **Custom endpoints** configured for Secret/TopSecret clouds as needed
- [ ] **No dependencies on public Azure** services

---

## Common pitfalls to avoid

### ❌ Using `:latest` image tags

```dockerfile
# DON'T:
FROM node:latest
FROM mcr.microsoft.com/dotnet:latest

# DO:
FROM myregistry.azurecr.us/node:20-lts@sha256:abc123...
FROM myregistry.azurecr.us/dotnet:8.0@sha256:xyz789...
```

**Why**: In air-gapped environments, you control when images are updated. Using `:latest` bypasses this control and makes rollbacks impossible.

---

### ❌ Assuming internet access for package managers

```bash
# DON'T:
npm install    # reaches out to npmjs.com
pip install -r requirements.txt  # reaches out to pypi.org

# DO:
npm ci --offline   # from local cache or internal registry
pip install -r requirements.txt --index-url https://pypi.internal/
```

**Why**: Air-gapped networks have no internet access. All dependencies must be resolved and staged in advance.

---

### ❌ Hardcoding secrets or connection strings

```python
# DON'T:
storage_connection_string = "DefaultEndpointsProtocol=https;AccountName=...;AccountKey=..."
blob_client = BlobClient.from_connection_string(storage_connection_string, container_name="data")

# DO:
from azure.identity import DefaultAzureCredential
credential = DefaultAzureCredential()
blob_client = BlobClient(
    account_url="https://mystg.blob.core.usgovcloudapi.net",
    container_name="data",
    credential=credential
)
```

**Why**: Hardcoded secrets in code or configs can be leaked. Use Managed Identity to securely access Azure services without storing credentials.

---

### ❌ Using public load balancers or public IPs

```bicep
# DON'T:
properties: {
  publicIPAllocationMethod: 'Static'
  publicIpAddress: { id: publicIpId }
}

# DO:
properties: {
  publicNetworkAccess: 'Disabled'
  privateIPAllocationMethod: 'Dynamic'
  privateLinkServiceConnections: [...]
}
```

**Why**: Public IPs expose resources to the internet, violating air-gap principles. Use private endpoints and internal load balancers.

---

### ❌ Forgetting Kubernetes system images in ACR

When deploying AKS in an air-gapped environment, the cluster needs system images:

```bash
# Pre-stage these in your private ACR:
myregistry.azurecr.us/pause:3.8@sha256:...
myregistry.azurecr.us/coredns:1.10@sha256:...
myregistry.azurecr.us/metrics-server:0.6.2@sha256:...
myregistry.azurecr.us/azure-cni-networkmonitor:1.4@sha256:...
```

**Why**: Without system images, AKS cluster creation will fail because it cannot pull images from the internet.

---

### ❌ Using `terraform init` without a local provider mirror

```bash
# DON'T (in air-gap):
terraform init  # tries to reach GitHub to download providers

# DO:
export TF_PLUGIN_CACHE_DIR=~/.terraform.d/plugins/
# (with providers already mirrored locally)
terraform init -upgrade=false
```

**Why**: Terraform tries to download providers from GitHub. Pre-mirror all providers and set `TF_PLUGIN_CACHE_DIR` to use local copies.

---

### ❌ Relying on external DNS resolution

```bash
# DON'T:
nslookup storage.internal  # queries 8.8.8.8 (public DNS)

# DO:
nslookup storage.internal @10.42.10.10  # query internal DNS server
```

**Why**: In air-gapped networks, public DNS services are unreachable. Configure all systems to use internal DNS.

---

### ❌ Deploying without required compliance tags

```bicep
# DON'T (missing tags):
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  // ...
  tags: { Environment: 'prod' }  // incomplete
}

# DO (all required tags):
tags: {
  Environment: 'prod'
  ManagedBy: 'bicep'
  Project: 'sovereign-auth'
  Owner: 'platform-team'
  Classification: 'Secret'
  Compliance: 'IL6'
}
```

**Why**: Compliance tracking, audit, and enforcement depend on standardized tags across all resources.

---

## References

- [Azure Government Documentation](https://learn.microsoft.com/en-us/azure/azure-government/)
- [Azure Stack Hub Operator Documentation](https://learn.microsoft.com/en-us/azure-stack/operator/)
- [Private Link for Azure Storage](https://learn.microsoft.com/en-us/azure/storage/common/storage-private-endpoints)
- [Managed Identity in Azure](https://learn.microsoft.com/en-us/azure/active-directory/managed-identities-azure-resources/)
- [Bicep Syntax Reference](https://learn.microsoft.com/en-us/azure/azure-resource-manager/bicep/syntax)
- [Terraform Azure Provider for Government Cloud](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)

