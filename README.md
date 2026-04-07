# sovereign-auth

Reference library and sample code for authenticating against **Azure
sovereign and classified cloud environments** using the
[`azure-identity`](https://pypi.org/project/azure-identity/) Python SDK.

Azure's classified tiers (Government Secret / Top Secret) use different
Azure AD authority endpoints and Azure Resource Manager (ARM) audience URIs
than the commercial or standard government cloud.  This repository provides
stub code that encapsulates those per-cloud differences so your application
code can stay cloud-agnostic.

---

## Supported cloud tiers

| `AzureCloud` enum member   | Tier                               | Authority host                       | Default ARM audience                          |
|----------------------------|------------------------------------|--------------------------------------|-----------------------------------------------|
| `PUBLIC`                   | Azure Public (Commercial)          | `https://login.microsoftonline.com`  | `https://management.azure.com/`               |
| `GOVERNMENT`               | Azure Government (IL2 / FedRAMP High) | `https://login.microsoftonline.us` | `https://management.usgovcloudapi.net/`       |
| `GOVERNMENT_SECRET`        | Azure Government Secret (IL4)      | *(classified – see note below)*      | *(classified – see note below)*               |
| `GOVERNMENT_TOP_SECRET`    | Azure Government Top Secret (IL6)  | *(classified – see note below)*      | *(classified – see note below)*               |

> **Classified endpoint placeholders**
> The `authority_host` and `default_audience` for the Secret and Top Secret
> tiers contain placeholder strings in
> [`src/sovereign_auth/cloud_config.py`](src/sovereign_auth/cloud_config.py).
> You must replace these with the actual values supplied by your programme's
> onboarding documentation before the library can authenticate against those
> environments.

---

## Repository layout

```
soverign-auth/
├── src/
│   └── sovereign_auth/
│       ├── __init__.py           # Public API re-exports
│       ├── cloud_config.py       # CloudConfig dataclass + AzureCloud enum
│       └── credential_factory.py # Helper functions wrapping azure-identity
├── samples/
│   ├── client_secret_sample.py   # Service principal (client secret) sample
│   ├── managed_identity_sample.py # Managed identity sample
│   └── README.md                 # Sample usage guide
├── tests/
│   ├── test_cloud_config.py
│   └── test_credential_factory.py
├── requirements.txt
└── README.md
```

---

## Installation

```bash
pip install -r requirements.txt
```

---

## Quick start

### Client Secret (service principal)

```python
from sovereign_auth import AzureCloud, get_client_secret_credential, get_cloud_config

cloud = AzureCloud.GOVERNMENT          # or .PUBLIC / .GOVERNMENT_SECRET / .GOVERNMENT_TOP_SECRET

credential = get_client_secret_credential(
    cloud=cloud,
    tenant_id="<tenant-id>",
    client_id="<client-id>",
    client_secret="<client-secret>",
)

scope = get_cloud_config(cloud).get_scope()   # e.g. "https://management.usgovcloudapi.net/.default"
token = credential.get_token(scope)
```

### Managed Identity

```python
from sovereign_auth import AzureCloud, get_managed_identity_credential

credential = get_managed_identity_credential(
    cloud=AzureCloud.GOVERNMENT,
    client_id="<user-assigned-mi-client-id>",  # omit for system-assigned
)

scope = credential.cloud_config.get_scope()
token = credential.get_token(scope)
```

### Generic dispatcher

```python
from sovereign_auth import AzureCloud, get_credential

credential = get_credential(
    cloud=AzureCloud.GOVERNMENT,
    credential_type="client_secret",   # or "managed_identity" / "workload_identity" / "default" / "chained"
    tenant_id="<tenant-id>",
    client_id="<client-id>",
    client_secret="<client-secret>",
)
```

### Custom audience (non-ARM resource)

```python
from sovereign_auth import AzureCloud, get_cloud_config

config = get_cloud_config(AzureCloud.GOVERNMENT)
scope = config.get_scope("https://vault.usgovcloudapi.net")
# → "https://vault.usgovcloudapi.net/.default"
```

---

## Running the samples

See [`samples/README.md`](samples/README.md) for full instructions.

```bash
export AZURE_CLOUD=government
export AZURE_TENANT_ID=<tenant-id>
export AZURE_CLIENT_ID=<client-id>
export AZURE_CLIENT_SECRET=<secret>

python samples/client_secret_sample.py
```

---

## Running the tests

```bash
pip install pytest
python -m pytest tests/ -v
```

---

## Configuring Secret / Top Secret endpoints

1. Open `src/sovereign_auth/cloud_config.py`.
2. Locate the `GOVERNMENT_SECRET_CLOUD` and `GOVERNMENT_TOP_SECRET_CLOUD`
   constants.
3. Replace the placeholder strings with the real endpoint values from your
   programme's onboarding documentation.
4. Re-run the test suite to confirm everything still passes.

---

## Contributing

Pull requests are welcome.  Please open an issue first to discuss any
significant changes.

## License

[MIT](LICENSE)
