"""
Credential factory helpers for Azure sovereign and classified clouds.

Each helper accepts the identifiers and secrets needed for a particular
credential type, wires them to the correct :class:`~.cloud_config.CloudConfig`
authority host, and returns a ready-to-use ``azure-identity`` credential
object.

Usage pattern
-------------
.. code-block:: python

    from sovereign_auth import AzureCloud, get_credential

    credential = get_credential(
        cloud=AzureCloud.GOVERNMENT,
        credential_type="client_secret",
        tenant_id="<tenant-id>",
        client_id="<client-id>",
        client_secret="<secret>",
    )

    token = credential.get_token("https://management.usgovcloudapi.net/.default")

Alternatively, use one of the specialised helpers such as
:func:`get_client_secret_credential` or
:func:`get_managed_identity_credential` directly.

Dependencies
------------
This module requires the ``azure-identity`` package::

    pip install azure-identity

"""

from __future__ import annotations

from typing import Any

from azure.identity import (
    ChainedTokenCredential,
    ClientSecretCredential,
    DefaultAzureCredential,
    EnvironmentCredential,
    ManagedIdentityCredential,
    WorkloadIdentityCredential,
)

from .cloud_config import AzureCloud, CloudConfig, get_cloud_config


# ---------------------------------------------------------------------------
# Specialised helpers
# ---------------------------------------------------------------------------


def get_client_secret_credential(
    *,
    cloud: AzureCloud,
    tenant_id: str,
    client_id: str,
    client_secret: str,
    **kwargs: Any,
) -> ClientSecretCredential:
    """Create a :class:`~azure.identity.ClientSecretCredential` for *cloud*.

    Parameters
    ----------
    cloud:
        Target Azure cloud tier.
    tenant_id:
        Azure AD / Entra ID tenant (directory) ID.
    client_id:
        Application (client) ID of the registered app.
    client_secret:
        Client secret value for the registered app.
    **kwargs:
        Additional keyword arguments forwarded to
        :class:`~azure.identity.ClientSecretCredential`.

    Returns
    -------
    ClientSecretCredential
        Configured for the specified sovereign cloud.
    """
    config: CloudConfig = get_cloud_config(cloud)
    return ClientSecretCredential(
        tenant_id=tenant_id,
        client_id=client_id,
        client_secret=client_secret,
        authority=config.authority_host,
        **kwargs,
    )


def get_managed_identity_credential(
    *,
    cloud: AzureCloud,
    client_id: str | None = None,
    **kwargs: Any,
) -> ManagedIdentityCredential:
    """Create a :class:`~azure.identity.ManagedIdentityCredential` for *cloud*.

    Managed identity credentials do **not** require an ``authority`` to be
    set on the credential object itself – the local IMDS endpoint handles
    token acquisition.  However, the *audience* (resource URI) in the scope
    must match the cloud tier, which is why the cloud enum is still accepted
    here (it is surfaced via :attr:`~.cloud_config.CloudConfig.default_audience`
    on the returned config, see the sample for usage).

    Parameters
    ----------
    cloud:
        Target Azure cloud tier.  Used to look up the correct audience; the
        returned :class:`~azure.identity.ManagedIdentityCredential` is also
        annotated with a ``cloud_config`` attribute for convenience.
    client_id:
        Optional user-assigned managed identity client ID.
    **kwargs:
        Additional keyword arguments forwarded to
        :class:`~azure.identity.ManagedIdentityCredential`.

    Returns
    -------
    ManagedIdentityCredential
        A credential annotated with a ``cloud_config`` attribute so that
        callers can retrieve the correct scope via
        ``credential.cloud_config.get_scope()``.
    """
    config: CloudConfig = get_cloud_config(cloud)
    credential = ManagedIdentityCredential(client_id=client_id, **kwargs)
    # Attach cloud config so callers can access the correct audience.
    credential.cloud_config = config  # type: ignore[attr-defined]
    return credential


def get_workload_identity_credential(
    *,
    cloud: AzureCloud,
    tenant_id: str | None = None,
    client_id: str | None = None,
    **kwargs: Any,
) -> WorkloadIdentityCredential:
    """Create a :class:`~azure.identity.WorkloadIdentityCredential` for *cloud*.

    Suitable for workloads running inside Kubernetes pods with federated
    identity credentials (Azure Workload Identity).

    Parameters
    ----------
    cloud:
        Target Azure cloud tier.
    tenant_id:
        Optional Azure AD tenant ID override.  When ``None`` the value is
        read from the ``AZURE_TENANT_ID`` environment variable.
    client_id:
        Optional application client ID override.  When ``None`` the value
        is read from the ``AZURE_CLIENT_ID`` environment variable.
    **kwargs:
        Additional keyword arguments forwarded to
        :class:`~azure.identity.WorkloadIdentityCredential`.

    Returns
    -------
    WorkloadIdentityCredential
        Configured for the specified sovereign cloud.
    """
    config: CloudConfig = get_cloud_config(cloud)
    return WorkloadIdentityCredential(
        tenant_id=tenant_id,
        client_id=client_id,
        authority=config.authority_host,
        **kwargs,
    )


def get_default_credential(
    *,
    cloud: AzureCloud,
    **kwargs: Any,
) -> DefaultAzureCredential:
    """Create a :class:`~azure.identity.DefaultAzureCredential` for *cloud*.

    ``DefaultAzureCredential`` walks through a predefined chain of credential
    sources (environment variables, managed identity, CLI, etc.).  Passing
    the correct ``authority_host`` ensures every source in the chain talks to
    the right sovereign endpoint.

    Parameters
    ----------
    cloud:
        Target Azure cloud tier.
    **kwargs:
        Additional keyword arguments forwarded to
        :class:`~azure.identity.DefaultAzureCredential`.

    Returns
    -------
    DefaultAzureCredential
        Configured for the specified sovereign cloud.
    """
    config: CloudConfig = get_cloud_config(cloud)
    return DefaultAzureCredential(
        authority=config.authority_host,
        **kwargs,
    )


def get_chained_credential(
    *,
    cloud: AzureCloud,
    **kwargs: Any,
) -> ChainedTokenCredential:
    """Create a :class:`~azure.identity.ChainedTokenCredential` for *cloud*.

    Returns a chain of :class:`~azure.identity.EnvironmentCredential` →
    :class:`~azure.identity.ManagedIdentityCredential` that tries environment
    variables first and falls back to managed identity.  This is useful when
    the same code must work both in a developer workstation (using a service
    principal in environment variables) and in a deployed Azure resource
    (using managed identity).

    Parameters
    ----------
    cloud:
        Target Azure cloud tier.
    **kwargs:
        Additional keyword arguments forwarded to
        :class:`~azure.identity.EnvironmentCredential`.

    Returns
    -------
    ChainedTokenCredential
        Two-source chain configured for the specified sovereign cloud.
    """
    config: CloudConfig = get_cloud_config(cloud)
    env_credential = EnvironmentCredential(authority=config.authority_host, **kwargs)
    mi_credential = ManagedIdentityCredential()
    mi_credential.cloud_config = config  # type: ignore[attr-defined]
    return ChainedTokenCredential(env_credential, mi_credential)


# ---------------------------------------------------------------------------
# Generic dispatcher
# ---------------------------------------------------------------------------

_CREDENTIAL_BUILDERS = {
    "client_secret": get_client_secret_credential,
    "managed_identity": get_managed_identity_credential,
    "workload_identity": get_workload_identity_credential,
    "default": get_default_credential,
    "chained": get_chained_credential,
}

_CREDENTIAL_TYPES = frozenset(_CREDENTIAL_BUILDERS)


def get_credential(
    *,
    cloud: AzureCloud,
    credential_type: str,
    **kwargs: Any,
) -> Any:
    """Return the appropriate azure-identity credential for *cloud*.

    Parameters
    ----------
    cloud:
        Target Azure cloud tier (use :class:`~.cloud_config.AzureCloud`).
    credential_type:
        One of ``"client_secret"``, ``"managed_identity"``,
        ``"workload_identity"``, ``"default"``, or ``"chained"``.
    **kwargs:
        Additional arguments forwarded to the underlying credential
        constructor (e.g. ``tenant_id``, ``client_id``, ``client_secret``).

    Returns
    -------
    azure.core.credentials.TokenCredential
        A credential object configured for the requested cloud tier.

    Raises
    ------
    ValueError
        If *credential_type* is not one of the recognised values.
    """
    if credential_type not in _CREDENTIAL_BUILDERS:
        raise ValueError(
            f"Unknown credential_type {credential_type!r}. "
            f"Valid options are: {sorted(_CREDENTIAL_TYPES)}"
        )
    return _CREDENTIAL_BUILDERS[credential_type](cloud=cloud, **kwargs)
