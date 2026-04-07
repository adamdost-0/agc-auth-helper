"""
Managed Identity credential sample for Azure sovereign clouds.

This sample demonstrates how to use a Managed Identity credential to
authenticate against Azure Resource Manager in each supported cloud tier.

Prerequisites
-------------
* The host resource (VM, App Service, AKS node, etc.) must have a managed
  identity assigned.
* For user-assigned managed identities, set the ``MI_CLIENT_ID`` environment
  variable to the identity's client ID.
* The identity must have the necessary RBAC permissions on the target resource.

Usage
-----
Set environment variables, then run::

    python managed_identity_sample.py

Environment variables
---------------------
``AZURE_CLOUD``
    Cloud tier to authenticate against.  Accepted values:
    ``public``, ``government``, ``government_secret``, ``government_top_secret``.
    Defaults to ``government``.

``MI_CLIENT_ID``
    (Optional) Client ID of a user-assigned managed identity.  When not set
    a system-assigned managed identity is used.
"""

import os
import sys

# ---------------------------------------------------------------------------
# Allow running directly from the repository root without installing the
# package (``python samples/managed_identity_sample.py``).
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from sovereign_auth import AzureCloud, get_managed_identity_credential  # noqa: E402


def main() -> None:
    # ------------------------------------------------------------------
    # 1. Resolve the target cloud from the environment.
    # ------------------------------------------------------------------
    cloud_name = os.getenv("AZURE_CLOUD", "government").lower()
    try:
        cloud = AzureCloud(cloud_name)
    except ValueError:
        valid = [c.value for c in AzureCloud]
        print(f"ERROR: Unrecognised AZURE_CLOUD value {cloud_name!r}. Valid: {valid}")
        sys.exit(1)

    # ------------------------------------------------------------------
    # 2. Build the managed-identity credential.
    # ------------------------------------------------------------------
    mi_client_id = os.getenv("MI_CLIENT_ID")  # None → system-assigned MI
    credential = get_managed_identity_credential(
        cloud=cloud,
        client_id=mi_client_id,
    )

    # ------------------------------------------------------------------
    # 3. Request a token for the default ARM audience of the chosen cloud.
    # ------------------------------------------------------------------
    scope = credential.cloud_config.get_scope()
    print(f"Cloud     : {cloud.value}")
    print(f"Authority : {credential.cloud_config.authority_host}")
    print(f"Scope     : {scope}")
    print()

    token = credential.get_token(scope)
    # Only show the first 20 characters of the token to avoid leaking it.
    print(f"Token acquired successfully (prefix: {token.token[:20]}…)")


if __name__ == "__main__":
    main()
