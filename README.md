# sovereign-auth

Reference web app architecture for **Azure Government**, **Azure Government Secret / Top Secret**, and **AzureStackCloud-style** environments that need explicit authority hosts, management endpoints, and token audiences when using the **`azure-identity`** stack.

## What this repo includes

- A minimal **backend-for-frontend** Node.js/TypeScript web app
- A **cloud profile registry** for sovereign and custom Azure clouds
- A deterministic **credential factory** for managed identity, workload identity, and local developer auth
- Sample **ARM** and **Storage** calls that use explicit token audiences instead of public-cloud defaults
- A **Bicep** deployment baseline for private ingress, managed identity, private endpoints, and diagnostics
- A **smoke-test** script and unit tests for configuration validation

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

The browser never talks directly to Azure control-plane or data-plane endpoints. The backend resolves a named cloud profile and keeps authority hosts, audience values, and service endpoints server-side.

## Cloud profile model

Each profile defines:

- `authorityHost`
- `resourceManagerEndpoint`
- `resourceManagerAudience`
- `serviceDnsSuffixes`
- `serviceAudiences`

The built-in profiles include:

- `azure-us-government`
- `azure-us-gov-secret`
- `azure-us-gov-topsecret`
- `azurestack-custom`

For Secret, Top Secret, and Azure Stack environments, the example profiles intentionally use **operator-supplied placeholder values** so teams can plug in the exact management endpoints and audience URLs used inside their enclave.

## Local development

1. Point npm at your **internal mirror**:

   ```bash
   export NPM_REGISTRY_URL=https://your-internal-registry.example.mil/npm/
   cp .npmrc.example .npmrc
   npm install --no-package-lock
   ```

2. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

3. Choose the target cloud and local auth mode:

   ```bash
   export AZURE_CLOUD=azure-us-government
   export AUTH_MODE=azureCli
   export AZURE_SUBSCRIPTION_ID=<subscription-id>
   export AZURE_STORAGE_ACCOUNT=<storage-account-name>
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

5. Open `http://localhost:3000`.

If you use `AUTH_MODE=azureCli`, set the Azure CLI to the correct sovereign cloud before running the app:

```bash
az cloud set --name AzureUSGovernment
az login --tenant <tenant-id>
```

## Smoke tests

- Run unit tests:

  ```bash
  npm test
  ```

- Validate every built-in cloud profile:

  ```bash
  npm run smoke-test -- --all
  ```

- Probe token acquisition for the selected cloud:

  ```bash
  AUTH_MODE=azureCli npm run smoke-test -- --check-token
  ```

## Deployment assets

The `infra/main.bicep` template provides a private deployment baseline with:

- required compliance tags
- App Service with **system-assigned managed identity**
- least-privilege **RBAC role assignments** for ARM, Blob data access, and Key Vault secret reads
- private endpoints for the web app, Storage, and Key Vault
- public network access disabled on dependent services
- diagnostic settings to Log Analytics

## Important note for classified clouds

This repository does **not** hardcode enclave-specific Secret or Top Secret endpoints. Supply those values through the JSON examples in `cloud-profiles/`, the documented audience environment variables, and the private DNS zone parameters in `infra/main.parameters.example.json` so the same app can run against your exact AzureStackCloud or sovereign deployment without code forks.
