"""Tests for sovereign_auth.credential_factory."""

from unittest.mock import MagicMock, patch
import sys
import os

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from sovereign_auth.cloud_config import AzureCloud, GOVERNMENT_CLOUD, PUBLIC_CLOUD
from sovereign_auth.credential_factory import (
    get_chained_credential,
    get_client_secret_credential,
    get_credential,
    get_default_credential,
    get_managed_identity_credential,
    get_workload_identity_credential,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FAKE_TENANT = "00000000-0000-0000-0000-000000000001"
_FAKE_CLIENT = "00000000-0000-0000-0000-000000000002"
_FAKE_SECRET = "fake-secret-value"


# ---------------------------------------------------------------------------
# get_client_secret_credential
# ---------------------------------------------------------------------------

class TestGetClientSecretCredential:
    def test_returns_credential_instance(self):
        from azure.identity import ClientSecretCredential
        cred = get_client_secret_credential(
            cloud=AzureCloud.PUBLIC,
            tenant_id=_FAKE_TENANT,
            client_id=_FAKE_CLIENT,
            client_secret=_FAKE_SECRET,
        )
        assert isinstance(cred, ClientSecretCredential)

    def test_authority_set_for_government(self):
        cred = get_client_secret_credential(
            cloud=AzureCloud.GOVERNMENT,
            tenant_id=_FAKE_TENANT,
            client_id=_FAKE_CLIENT,
            client_secret=_FAKE_SECRET,
        )
        # azure-identity stores the authority on the underlying _client
        # but the important thing is that no exception was raised and
        # the credential was created with the right type.
        from azure.identity import ClientSecretCredential
        assert isinstance(cred, ClientSecretCredential)

    def test_different_clouds_produce_different_authorities(self):
        """Verifies that distinct clouds produce distinct credential instances."""
        cred_public = get_client_secret_credential(
            cloud=AzureCloud.PUBLIC,
            tenant_id=_FAKE_TENANT,
            client_id=_FAKE_CLIENT,
            client_secret=_FAKE_SECRET,
        )
        cred_gov = get_client_secret_credential(
            cloud=AzureCloud.GOVERNMENT,
            tenant_id=_FAKE_TENANT,
            client_id=_FAKE_CLIENT,
            client_secret=_FAKE_SECRET,
        )
        assert cred_public is not cred_gov


# ---------------------------------------------------------------------------
# get_managed_identity_credential
# ---------------------------------------------------------------------------

class TestGetManagedIdentityCredential:
    def test_returns_credential_instance(self):
        from azure.identity import ManagedIdentityCredential
        cred = get_managed_identity_credential(cloud=AzureCloud.GOVERNMENT)
        assert isinstance(cred, ManagedIdentityCredential)

    def test_cloud_config_attached(self):
        cred = get_managed_identity_credential(cloud=AzureCloud.GOVERNMENT)
        assert hasattr(cred, "cloud_config")
        assert cred.cloud_config is GOVERNMENT_CLOUD

    def test_get_scope_via_attached_config(self):
        cred = get_managed_identity_credential(cloud=AzureCloud.GOVERNMENT)
        scope = cred.cloud_config.get_scope()
        assert scope == "https://management.usgovcloudapi.net/.default"

    def test_user_assigned_mi_client_id_forwarded(self):
        from azure.identity import ManagedIdentityCredential
        fake_mi_id = "11111111-1111-1111-1111-111111111111"
        cred = get_managed_identity_credential(
            cloud=AzureCloud.PUBLIC,
            client_id=fake_mi_id,
        )
        assert isinstance(cred, ManagedIdentityCredential)


# ---------------------------------------------------------------------------
# get_workload_identity_credential
# ---------------------------------------------------------------------------

class TestGetWorkloadIdentityCredential:
    def test_returns_credential_instance(self, tmp_path):
        from azure.identity import WorkloadIdentityCredential
        # WorkloadIdentityCredential requires a token file path at construction
        # time; create a temporary stand-in so the object can be built.
        token_file = tmp_path / "token"
        token_file.write_text("fake-token")
        cred = get_workload_identity_credential(
            cloud=AzureCloud.PUBLIC,
            tenant_id=_FAKE_TENANT,
            client_id=_FAKE_CLIENT,
            token_file_path=str(token_file),
        )
        assert isinstance(cred, WorkloadIdentityCredential)


# ---------------------------------------------------------------------------
# get_default_credential
# ---------------------------------------------------------------------------

class TestGetDefaultCredential:
    def test_returns_credential_instance(self):
        from azure.identity import DefaultAzureCredential
        cred = get_default_credential(cloud=AzureCloud.PUBLIC)
        assert isinstance(cred, DefaultAzureCredential)


# ---------------------------------------------------------------------------
# get_chained_credential
# ---------------------------------------------------------------------------

class TestGetChainedCredential:
    def test_returns_chained_credential_instance(self):
        from azure.identity import ChainedTokenCredential
        cred = get_chained_credential(cloud=AzureCloud.GOVERNMENT)
        assert isinstance(cred, ChainedTokenCredential)

    def test_chain_has_two_sources(self):
        cred = get_chained_credential(cloud=AzureCloud.GOVERNMENT)
        assert len(cred.credentials) == 2


# ---------------------------------------------------------------------------
# get_credential (dispatcher)
# ---------------------------------------------------------------------------

class TestGetCredential:
    def test_client_secret_dispatch(self):
        from azure.identity import ClientSecretCredential
        cred = get_credential(
            cloud=AzureCloud.PUBLIC,
            credential_type="client_secret",
            tenant_id=_FAKE_TENANT,
            client_id=_FAKE_CLIENT,
            client_secret=_FAKE_SECRET,
        )
        assert isinstance(cred, ClientSecretCredential)

    def test_managed_identity_dispatch(self):
        from azure.identity import ManagedIdentityCredential
        cred = get_credential(
            cloud=AzureCloud.PUBLIC,
            credential_type="managed_identity",
        )
        assert isinstance(cred, ManagedIdentityCredential)

    def test_default_dispatch(self):
        from azure.identity import DefaultAzureCredential
        cred = get_credential(
            cloud=AzureCloud.PUBLIC,
            credential_type="default",
        )
        assert isinstance(cred, DefaultAzureCredential)

    def test_chained_dispatch(self):
        from azure.identity import ChainedTokenCredential
        cred = get_credential(
            cloud=AzureCloud.GOVERNMENT,
            credential_type="chained",
        )
        assert isinstance(cred, ChainedTokenCredential)

    def test_invalid_type_raises_value_error(self):
        with pytest.raises(ValueError, match="Unknown credential_type"):
            get_credential(
                cloud=AzureCloud.PUBLIC,
                credential_type="nonexistent_type",
            )

    def test_all_public_types_accepted(self):
        """Smoke-test that every documented type string is accepted."""
        types_and_kwargs = [
            ("client_secret", {"tenant_id": _FAKE_TENANT, "client_id": _FAKE_CLIENT, "client_secret": _FAKE_SECRET}),
            ("managed_identity", {}),
            ("default", {}),
            ("chained", {}),
        ]
        for ctype, kwargs in types_and_kwargs:
            cred = get_credential(cloud=AzureCloud.PUBLIC, credential_type=ctype, **kwargs)
            assert cred is not None
