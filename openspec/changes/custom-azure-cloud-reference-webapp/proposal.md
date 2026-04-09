## Why

Teams building for AzureStackCloud and classified sovereign environments such as Azure Government Secret and Top Secret cannot rely on the default Azure public cloud assumptions baked into many samples. They need a reference web app architecture that treats authority hosts, management endpoints, and token audiences as first-class configuration so `azure-identity` and downstream SDK clients work correctly in custom Azure clouds.

## What Changes

- Add a reference private web app architecture for air-gapped and sovereign Azure environments, including internal ingress, backend-for-frontend API, managed identity, and private data services.
- Define a configuration-driven custom cloud profile model for `azure-identity`, Azure Resource Manager, and data-plane services so authority hosts, endpoints, and audience URLs can vary by environment.
- Describe the credential acquisition strategy for local development, workload identity, and managed identity without hardcoded secrets or cloud-specific code forks.
- Break the work into implementation tasks for a sample application and supporting deployment assets.

## Capabilities

### New Capabilities

- `custom-cloud-profile`: Model and validate custom Azure cloud metadata, including authority hosts, management endpoints, and resource audiences.
- `reference-web-app`: Provide a reference web app architecture that demonstrates secure sign-in and Azure service access in AzureStackCloud and sovereign enclaves.

### Modified Capabilities

- None.

## Impact

- Adds new OpenSpec requirements for custom cloud identity bootstrapping and the reference web app pattern.
- Shapes future application code around a shared cloud profile registry, credential factory, and cloud-aware client builders.
- Affects deployment templates, local development guidance, and validation flows for Azure Government, Secret/Top Secret, and AzureStackCloud targets.
