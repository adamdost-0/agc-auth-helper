# Samples

This directory contains ready-to-run Python samples that demonstrate how to
authenticate against each supported Azure cloud tier using the
`sovereign_auth` reference library.

## Prerequisites

1. **Python 3.9+**
2. Install dependencies from the repository root:

   ```bash
   pip install -r requirements.txt
   ```

3. For each sample, set the environment variables described below before
   running.

---

## `client_secret_sample.py`

Authenticates a service principal against Azure Resource Manager using a
**client secret**.

| Environment variable  | Required | Description                                                                 |
|-----------------------|----------|-----------------------------------------------------------------------------|
| `AZURE_CLOUD`         | No       | Cloud tier: `public`, `government`, `government_secret`, `government_top_secret`. Defaults to `government`. |
| `AZURE_TENANT_ID`     | **Yes**  | Azure AD tenant (directory) ID.                                             |
| `AZURE_CLIENT_ID`     | **Yes**  | Application (client) ID.                                                    |
| `AZURE_CLIENT_SECRET` | **Yes**  | Client secret value.                                                        |
| `AZURE_ARM_AUDIENCE`  | No       | Custom ARM audience override (e.g. for a non-ARM resource).                 |

```bash
export AZURE_CLOUD=government
export AZURE_TENANT_ID=<your-tenant-id>
export AZURE_CLIENT_ID=<your-client-id>
export AZURE_CLIENT_SECRET=<your-client-secret>

python samples/client_secret_sample.py
```

---

## `managed_identity_sample.py`

Authenticates using a **managed identity** assigned to the host Azure
resource (VM, App Service, AKS node, etc.).

| Environment variable | Required | Description                                                                  |
|----------------------|----------|------------------------------------------------------------------------------|
| `AZURE_CLOUD`        | No       | Cloud tier: `public`, `government`, `government_secret`, `government_top_secret`. Defaults to `government`. |
| `MI_CLIENT_ID`       | No       | Client ID of a **user-assigned** managed identity. Omit for system-assigned. |

```bash
export AZURE_CLOUD=government
# Optional – only needed for user-assigned MI:
export MI_CLIENT_ID=<your-mi-client-id>

python samples/managed_identity_sample.py
```

---

## Supported cloud tiers

| `AZURE_CLOUD` value        | Tier                               | Authority host                                       | Default ARM audience                               |
|----------------------------|------------------------------------|------------------------------------------------------|----------------------------------------------------|
| `public`                   | Azure Public (Commercial)          | `https://login.microsoftonline.com`                  | `https://management.azure.com/`                    |
| `government`               | Azure Government (IL2 / FedRAMP High) | `https://login.microsoftonline.us`               | `https://management.usgovcloudapi.net/`            |
| `government_secret`        | Azure Government Secret (IL4)      | *(classified – replace placeholder in `cloud_config.py`)* | *(classified – replace placeholder)*    |
| `government_top_secret`    | Azure Government Top Secret (IL6)  | *(classified – replace placeholder in `cloud_config.py`)* | *(classified – replace placeholder)*    |

> **Note:** The endpoint values for the Secret and Top Secret tiers are
> **classified**.  You must obtain them from your programme's onboarding
> documentation and update the placeholder strings in
> `src/sovereign_auth/cloud_config.py` before the samples will work against
> those environments.
