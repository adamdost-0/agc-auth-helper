import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { shouldDisableInstanceDiscovery } from "../../src/auth/credentialFactory.js";
import { getBuiltinCloudProfile } from "../../src/config/cloudProfile.js";
import type { SupportedCloudName } from "../../src/config/cloudProfile.js";

// ── 1. Well-known hosts return false ─────────────────────────────────────────

describe("shouldDisableInstanceDiscovery — well-known hosts return false", () => {
  test("Azure Public (no trailing slash)", () => {
    assert.equal(shouldDisableInstanceDiscovery("https://login.microsoftonline.com"), false);
  });

  test("Azure Public (trailing slash)", () => {
    assert.equal(shouldDisableInstanceDiscovery("https://login.microsoftonline.com/"), false);
  });

  test("Azure Government (no trailing slash)", () => {
    assert.equal(shouldDisableInstanceDiscovery("https://login.microsoftonline.us"), false);
  });

  test("Azure Government (trailing slash)", () => {
    assert.equal(shouldDisableInstanceDiscovery("https://login.microsoftonline.us/"), false);
  });

  test("Azure China", () => {
    assert.equal(shouldDisableInstanceDiscovery("https://login.chinacloudapi.cn"), false);
  });
});

// ── 2. Custom / air-gapped hosts return true ─────────────────────────────────

describe("shouldDisableInstanceDiscovery — custom hosts return true", () => {
  const customHosts = [
    "https://login.secret.contoso.internal/",
    "https://login.topsecret.contoso.internal/",
    "https://login.azurestack.contoso.local/",
    "https://login.microsoftonline.microsoft.scloud/",
    "https://login.microsoftonline.eaglex.ic.gov/",
    "https://custom.authority.example.com/",
  ];

  for (const host of customHosts) {
    test(`${host} → true`, () => {
      assert.equal(shouldDisableInstanceDiscovery(host), true);
    });
  }
});

// ── 3. Per-cloud credential plan verification ────────────────────────────────

describe("per-cloud credential plan — instance discovery flag matches cloud type", () => {
  const expectations: Array<{ cloud: SupportedCloudName; expected: boolean; reason: string }> = [
    { cloud: "azure-commercial", expected: false, reason: "well-known public host" },
    { cloud: "azure-us-government", expected: false, reason: "well-known gov host" },
    { cloud: "azure-us-gov-secret", expected: true, reason: "custom secret host" },
    { cloud: "azure-us-gov-topsecret", expected: true, reason: "custom topsecret host" },
    { cloud: "azurestack-custom", expected: true, reason: "custom azurestack host" },
  ];

  for (const { cloud, expected, reason } of expectations) {
    test(`${cloud} → disableInstanceDiscovery=${expected} (${reason})`, () => {
      const profile = getBuiltinCloudProfile(cloud, {});
      const result = shouldDisableInstanceDiscovery(profile.authorityHost);
      assert.equal(result, expected, `${cloud}: expected ${expected} for ${profile.authorityHost}`);
    });
  }
});
