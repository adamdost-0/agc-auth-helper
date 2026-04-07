"""
Client Secret credential sample for Azure sovereign clouds.

This sample demonstrates how to authenticate a service principal (app
registration) against Azure Resource Manager using a client secret in each
supported cloud tier.

Prerequisites
-------------
* An app registration must exist in the target tenant.
* The app must have a client secret created.
* The service principal must have the necessary RBAC permissions on the
  target resource.

Usage
-----
Set the required environment variables, then run::

    python client_secret_sample.py

Environment variables
---------------------
``AZURE_CLOUD``
    Cloud tier to authenticate against.  Accepted values:
    ``public``, ``government``, ``government_secret``, ``government_top_secret``.
    Defaults to ``government``.

``AZURE_TENANT_ID``
    Azure AD / Entra ID tenant (directory) ID.  **Required.**

``AZURE_CLIENT_ID``
    Application (client) ID of the registered app.  **Required.**

``AZURE_CLIENT_SECRET``
    Client secret value for the registered app.  **Required.**

``AZURE_ARM_AUDIENCE``
    (Optional) Custom ARM audience override.  When not set, the default
    audience for the chosen cloud tier is used.
"""

import os
import sys

# ---------------------------------------------------------------------------
# Allow running directly from the repository root without installing the
# package (``python samples/client_secret_sample.py``).
# ---------------------------------------------------------------------------
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from sovereign_auth import AzureCloud, get_client_secret_credential, get_cloud_config  # noqa: E402


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        print(f"ERROR: Required environment variable {name!r} is not set.")
        sys.exit(1)
    return value


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
    # 2. Read required credentials from the environment.
    # ------------------------------------------------------------------
    tenant_id = _require_env("AZURE_TENANT_ID")
    client_id = _require_env("AZURE_CLIENT_ID")
    client_secret = _require_env("AZURE_CLIENT_SECRET")

    # ------------------------------------------------------------------
    # 3. Build the client-secret credential for the chosen cloud.
    # ------------------------------------------------------------------
    credential = get_client_secret_credential(
        cloud=cloud,
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
    )

    # ------------------------------------------------------------------
    # 4. Determine the scope (audience) to request a token for.
    # ------------------------------------------------------------------
    config = get_cloud_config(cloud)
    custom_audience = os.getenv("AZURE_ARM_AUDIENCE")
    scope = config.get_scope(custom_audience)

    print(f"Cloud     : {cloud.value}")
    print(f"Authority : {config.authority_host}")
    print(f"Tenant    : {tenant_id}")
    print(f"Client ID : {client_id}")
    print(f"Scope     : {scope}")
    print()

    # ------------------------------------------------------------------
    # 5. Acquire a token.
    # ------------------------------------------------------------------
    token = credential.get_token(scope)
    # Only show the first 20 characters of the token to avoid leaking it.
    print(f"Token acquired successfully (prefix: {token.token[:20]}…)")


if __name__ == "__main__":
    main()
