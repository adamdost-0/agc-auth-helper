"""
sovereign_auth – reference library for Azure sovereign/classified cloud identity.

Quickstart
----------
.. code-block:: python

    from sovereign_auth import AzureCloud, get_credential

    # Client-secret credential for Azure Government
    credential = get_credential(
        cloud=AzureCloud.GOVERNMENT,
        credential_type="client_secret",
        tenant_id="<tenant-id>",
        client_id="<client-id>",
        client_secret="<secret>",
    )

    scope = "https://management.usgovcloudapi.net/.default"
    token = credential.get_token(scope)

See the ``samples/`` directory for complete working examples.
"""

from .cloud_config import (
    PUBLIC_CLOUD,
    GOVERNMENT_CLOUD,
    GOVERNMENT_SECRET_CLOUD,
    GOVERNMENT_TOP_SECRET_CLOUD,
    AzureCloud,
    CloudConfig,
    get_cloud_config,
)
from .credential_factory import (
    get_chained_credential,
    get_client_secret_credential,
    get_credential,
    get_default_credential,
    get_managed_identity_credential,
    get_workload_identity_credential,
)

__all__ = [
    # Cloud config
    "AzureCloud",
    "CloudConfig",
    "PUBLIC_CLOUD",
    "GOVERNMENT_CLOUD",
    "GOVERNMENT_SECRET_CLOUD",
    "GOVERNMENT_TOP_SECRET_CLOUD",
    "get_cloud_config",
    # Credential factory
    "get_credential",
    "get_client_secret_credential",
    "get_managed_identity_credential",
    "get_workload_identity_credential",
    "get_default_credential",
    "get_chained_credential",
]
