"""
Cloud environment configurations for Azure sovereign and classified clouds.

Each :class:`CloudConfig` instance captures the two settings that differ
between cloud tiers and that ``azure-identity`` needs at runtime:

* ``authority_host`` – the Azure AD / Entra ID login endpoint
* ``default_audience`` – the resource URI used as the OAuth2 scope
  (appended with ``/.default`` when calling
  :pymeth:`~azure.core.credentials.TokenCredential.get_token`)

Publicly documented values are used for the commercial and government
(IL2/FedRAMP High) tiers.  The Secret and Top Secret tier endpoints are
**classified**; the placeholders below must be replaced with the actual
values obtained from your classification-appropriate onboarding
documentation before any code in this package can successfully
authenticate against those environments.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


@dataclass(frozen=True)
class CloudConfig:
    """Immutable bundle of endpoint values for one Azure cloud tier."""

    # Azure AD / Entra ID authentication endpoint (no trailing slash).
    authority_host: str

    # Default Azure Resource Manager (ARM) audience for the cloud tier.
    # When requesting an ARM token, pass ``f"{default_audience}/.default"``
    # as the scope argument to ``credential.get_token()``.
    default_audience: str

    def get_scope(self, audience: str | None = None) -> str:
        """Return the OAuth2 scope string for *audience*.

        If *audience* is ``None`` the :attr:`default_audience` is used.

        Parameters
        ----------
        audience:
            Optional override for the resource URI.  Must not end with
            ``/.default`` – that suffix is appended automatically.

        Returns
        -------
        str
            Scope string ready to pass to
            :pymeth:`~azure.core.credentials.TokenCredential.get_token`.
        """
        base = audience if audience is not None else self.default_audience
        return f"{base.rstrip('/')}/.default"


class AzureCloud(Enum):
    """Enumeration of supported Azure cloud tiers."""

    # ------------------------------------------------------------------ #
    # Commercial / public cloud                                            #
    # ------------------------------------------------------------------ #
    PUBLIC = "public"

    # ------------------------------------------------------------------ #
    # Azure Government (IL2 / FedRAMP High)                               #
    # Authority: https://login.microsoftonline.us                         #
    # ------------------------------------------------------------------ #
    GOVERNMENT = "government"

    # ------------------------------------------------------------------ #
    # Azure Government Secret (IL4 / Secret)                              #
    # Endpoints are classified.  Replace the placeholder strings below    #
    # with the actual values from your programme's onboarding guidance.   #
    # ------------------------------------------------------------------ #
    GOVERNMENT_SECRET = "government_secret"

    # ------------------------------------------------------------------ #
    # Azure Government Top Secret (IL6 / Top Secret)                      #
    # Endpoints are classified.  Replace the placeholder strings below    #
    # with the actual values from your programme's onboarding guidance.   #
    # ------------------------------------------------------------------ #
    GOVERNMENT_TOP_SECRET = "government_top_secret"


# ---------------------------------------------------------------------------
# Canonical configs
# ---------------------------------------------------------------------------

#: Azure public (commercial) cloud.
PUBLIC_CLOUD = CloudConfig(
    authority_host="https://login.microsoftonline.com",
    default_audience="https://management.azure.com/",
)

#: Azure Government cloud (MAG – IL2, FedRAMP High).
GOVERNMENT_CLOUD = CloudConfig(
    authority_host="https://login.microsoftonline.us",
    default_audience="https://management.usgovcloudapi.net/",
)

#: Azure Government **Secret** cloud (MAG-S – IL4).
#:
#: .. warning::
#:     The ``authority_host`` and ``default_audience`` values below are
#:     **placeholders**.  You must replace them with the classified
#:     endpoint values provided in your programme's onboarding
#:     documentation before this configuration will work.
GOVERNMENT_SECRET_CLOUD = CloudConfig(
    authority_host="https://<authority-host-for-il4-secret-cloud>",
    default_audience="https://<arm-audience-for-il4-secret-cloud>/",
)

#: Azure Government **Top Secret** cloud (MAG-TS – IL6).
#:
#: .. warning::
#:     The ``authority_host`` and ``default_audience`` values below are
#:     **placeholders**.  You must replace them with the classified
#:     endpoint values provided in your programme's onboarding
#:     documentation before this configuration will work.
GOVERNMENT_TOP_SECRET_CLOUD = CloudConfig(
    authority_host="https://<authority-host-for-il6-top-secret-cloud>",
    default_audience="https://<arm-audience-for-il6-top-secret-cloud>/",
)

# ---------------------------------------------------------------------------
# Lookup helper
# ---------------------------------------------------------------------------

_REGISTRY: dict[AzureCloud, CloudConfig] = {
    AzureCloud.PUBLIC: PUBLIC_CLOUD,
    AzureCloud.GOVERNMENT: GOVERNMENT_CLOUD,
    AzureCloud.GOVERNMENT_SECRET: GOVERNMENT_SECRET_CLOUD,
    AzureCloud.GOVERNMENT_TOP_SECRET: GOVERNMENT_TOP_SECRET_CLOUD,
}


def get_cloud_config(cloud: AzureCloud) -> CloudConfig:
    """Return the :class:`CloudConfig` for *cloud*.

    Parameters
    ----------
    cloud:
        One of the :class:`AzureCloud` enum members.

    Returns
    -------
    CloudConfig
        The corresponding endpoint bundle.

    Raises
    ------
    KeyError
        If *cloud* is not registered (should not occur for the built-in
        enum members).
    """
    return _REGISTRY[cloud]
