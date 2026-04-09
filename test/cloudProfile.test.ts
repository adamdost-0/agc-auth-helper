import assert from "node:assert/strict";
import test from "node:test";

import { resolveAuthMode } from "../src/auth/credentialFactory.js";
import {
  audienceToScope,
  getBuiltinCloudProfile,
  resolveCloudProfile,
  validateCloudProfile,
} from "../src/config/cloudProfile.js";

test("Azure Commercial profile resolves public cloud endpoints", () => {
  const profile = getBuiltinCloudProfile("azure-commercial", {});

  assert.equal(profile.authorityHost, "https://login.microsoftonline.com/");
  assert.equal(profile.resourceManagerEndpoint, "https://management.azure.com/");
  assert.equal(profile.serviceDnsSuffixes.storage, ".blob.core.windows.net");
});

test("Azure Government profile resolves known sovereign endpoints", () => {
  const profile = getBuiltinCloudProfile("azure-us-government", {});

  assert.equal(profile.authorityHost, "https://login.microsoftonline.us/");
  assert.equal(profile.resourceManagerEndpoint, "https://management.usgovcloudapi.net/");
  assert.equal(profile.serviceDnsSuffixes.storage, ".blob.core.usgovcloudapi.net");
});

test("cloud profile validation fails closed for malformed management endpoint", () => {
  const profile = getBuiltinCloudProfile("azure-us-government", {});

  assert.throws(
    () =>
      validateCloudProfile({
        ...profile,
        resourceManagerEndpoint: "not-a-valid-url",
      }),
    /resourceManagerEndpoint/,
  );
});

test("audienceToScope appends .default to a custom audience", () => {
  assert.equal(
    audienceToScope("https://management.usgovcloudapi.net/"),
    "https://management.usgovcloudapi.net/.default",
  );
  assert.equal(audienceToScope("api://custom-arm"), "api://custom-arm/.default");
});

test("auth mode prefers workload identity when projected token settings are present", () => {
  const mode = resolveAuthMode({
    AZURE_FEDERATED_TOKEN_FILE: "/var/run/secrets/tokens/azure-identity",
    AZURE_CLIENT_ID: "11111111-1111-1111-1111-111111111111",
    AZURE_TENANT_ID: "22222222-2222-2222-2222-222222222222",
  });

  assert.equal(mode, "workloadIdentity");
});

test("resource manager audience override updates the ARM audience used by the profile", () => {
  const profile = resolveCloudProfile({
    name: "azure-us-government",
    env: {
      AZURE_RESOURCE_MANAGER_AUDIENCE: "https://management.custom.contoso.internal/",
    },
  });

  assert.equal(
    profile.resourceManagerAudience,
    "https://management.custom.contoso.internal/",
  );
  assert.equal(
    profile.serviceAudiences.arm,
    "https://management.custom.contoso.internal/",
  );
});
