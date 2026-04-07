"""Tests for sovereign_auth.cloud_config."""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from sovereign_auth.cloud_config import (
    PUBLIC_CLOUD,
    GOVERNMENT_CLOUD,
    GOVERNMENT_SECRET_CLOUD,
    GOVERNMENT_TOP_SECRET_CLOUD,
    AzureCloud,
    CloudConfig,
    get_cloud_config,
)


class TestCloudConfig:
    def test_get_scope_default_audience(self):
        config = CloudConfig(
            authority_host="https://login.example.com",
            default_audience="https://resource.example.com/",
        )
        assert config.get_scope() == "https://resource.example.com/.default"

    def test_get_scope_strips_trailing_slash_from_default(self):
        config = CloudConfig(
            authority_host="https://login.example.com",
            default_audience="https://resource.example.com/",
        )
        assert config.get_scope() == "https://resource.example.com/.default"

    def test_get_scope_custom_audience(self):
        config = CloudConfig(
            authority_host="https://login.example.com",
            default_audience="https://resource.example.com/",
        )
        assert config.get_scope("https://other.example.com") == "https://other.example.com/.default"

    def test_get_scope_custom_audience_trailing_slash_stripped(self):
        config = CloudConfig(
            authority_host="https://login.example.com",
            default_audience="https://resource.example.com/",
        )
        assert config.get_scope("https://other.example.com/") == "https://other.example.com/.default"

    def test_frozen(self):
        config = CloudConfig(
            authority_host="https://login.example.com",
            default_audience="https://resource.example.com/",
        )
        with pytest.raises((AttributeError, TypeError)):
            config.authority_host = "https://other.example.com"  # type: ignore[misc]


class TestPublicCloud:
    def test_authority_host(self):
        assert PUBLIC_CLOUD.authority_host == "https://login.microsoftonline.com"

    def test_default_audience(self):
        assert PUBLIC_CLOUD.default_audience == "https://management.azure.com/"

    def test_scope(self):
        assert PUBLIC_CLOUD.get_scope() == "https://management.azure.com/.default"


class TestGovernmentCloud:
    def test_authority_host(self):
        assert GOVERNMENT_CLOUD.authority_host == "https://login.microsoftonline.us"

    def test_default_audience(self):
        assert GOVERNMENT_CLOUD.default_audience == "https://management.usgovcloudapi.net/"

    def test_scope(self):
        assert GOVERNMENT_CLOUD.get_scope() == "https://management.usgovcloudapi.net/.default"


class TestGovernmentSecretCloud:
    def test_authority_host_is_placeholder(self):
        # The placeholder must contain recognisable placeholder text so
        # integrators know they must substitute the real value.
        assert "il4" in GOVERNMENT_SECRET_CLOUD.authority_host.lower() or \
               "secret" in GOVERNMENT_SECRET_CLOUD.authority_host.lower() or \
               "<" in GOVERNMENT_SECRET_CLOUD.authority_host

    def test_default_audience_is_placeholder(self):
        assert "il4" in GOVERNMENT_SECRET_CLOUD.default_audience.lower() or \
               "secret" in GOVERNMENT_SECRET_CLOUD.default_audience.lower() or \
               "<" in GOVERNMENT_SECRET_CLOUD.default_audience

    def test_scope_returns_default_suffix(self):
        scope = GOVERNMENT_SECRET_CLOUD.get_scope()
        assert scope.endswith("/.default")


class TestGovernmentTopSecretCloud:
    def test_authority_host_is_placeholder(self):
        assert "il6" in GOVERNMENT_TOP_SECRET_CLOUD.authority_host.lower() or \
               "top" in GOVERNMENT_TOP_SECRET_CLOUD.authority_host.lower() or \
               "secret" in GOVERNMENT_TOP_SECRET_CLOUD.authority_host.lower() or \
               "<" in GOVERNMENT_TOP_SECRET_CLOUD.authority_host

    def test_default_audience_is_placeholder(self):
        assert "il6" in GOVERNMENT_TOP_SECRET_CLOUD.default_audience.lower() or \
               "top" in GOVERNMENT_TOP_SECRET_CLOUD.default_audience.lower() or \
               "secret" in GOVERNMENT_TOP_SECRET_CLOUD.default_audience.lower() or \
               "<" in GOVERNMENT_TOP_SECRET_CLOUD.default_audience

    def test_scope_returns_default_suffix(self):
        scope = GOVERNMENT_TOP_SECRET_CLOUD.get_scope()
        assert scope.endswith("/.default")


class TestGetCloudConfig:
    def test_public(self):
        assert get_cloud_config(AzureCloud.PUBLIC) is PUBLIC_CLOUD

    def test_government(self):
        assert get_cloud_config(AzureCloud.GOVERNMENT) is GOVERNMENT_CLOUD

    def test_government_secret(self):
        assert get_cloud_config(AzureCloud.GOVERNMENT_SECRET) is GOVERNMENT_SECRET_CLOUD

    def test_government_top_secret(self):
        assert get_cloud_config(AzureCloud.GOVERNMENT_TOP_SECRET) is GOVERNMENT_TOP_SECRET_CLOUD

    def test_all_enum_members_are_registered(self):
        for member in AzureCloud:
            config = get_cloud_config(member)
            assert isinstance(config, CloudConfig)


class TestAzureCloudEnum:
    def test_values(self):
        assert AzureCloud("public") is AzureCloud.PUBLIC
        assert AzureCloud("government") is AzureCloud.GOVERNMENT
        assert AzureCloud("government_secret") is AzureCloud.GOVERNMENT_SECRET
        assert AzureCloud("government_top_secret") is AzureCloud.GOVERNMENT_TOP_SECRET

    def test_invalid_value_raises(self):
        with pytest.raises(ValueError):
            AzureCloud("nonexistent_cloud")
