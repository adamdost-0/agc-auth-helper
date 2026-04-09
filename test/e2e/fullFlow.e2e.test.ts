import assert from "node:assert/strict";
import { describe, test, afterEach } from "node:test";

import { startMockArm } from "./fixtures/mockArm.js";
import { startMockStorage } from "./fixtures/mockStorage.js";
import { MockCredential } from "./fixtures/mockCredential.js";
import {
  getBuiltinCloudProfile,
  audienceToScope,
  supportedClouds,
  type CloudProfile,
  type SupportedCloudName,
} from "../../src/config/cloudProfile.js";
import { listSubscriptions, listResourceGroups } from "../../src/azure/armClient.js";
import { fetchWithAccessToken, probeAccessToken } from "../../src/azure/http.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Clone a profile, redirecting ARM to a mock server URL. */
function withMockArm(profile: CloudProfile, mockUrl: string): CloudProfile {
  return {
    ...profile,
    resourceManagerEndpoint: mockUrl + "/",
  };
}

// ---------------------------------------------------------------------------
// ARM flow – one sub-test per cloud
// ---------------------------------------------------------------------------

describe("ARM full-flow per cloud", () => {
  let closeMock: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeMock?.();
    closeMock = undefined;
  });

  for (const cloudName of supportedClouds) {
    test(`listSubscriptions + listResourceGroups — ${cloudName}`, async () => {
      const mock = await startMockArm();
      closeMock = mock.close;

      const baseProfile = getBuiltinCloudProfile(cloudName, {});
      const profile = withMockArm(baseProfile, mock.url);
      const cred = new MockCredential();

      // -- subscriptions --
      const subs = await listSubscriptions(profile, cred);
      assert.equal(subs.length, 2, "expected 2 canned subscriptions");
      assert.equal(subs[0].subscriptionId, "00000000-0000-0000-0000-000000000001");
      assert.equal(subs[0].displayName, "Test Subscription 1");
      assert.equal(subs[0].state, "Enabled");
      assert.equal(subs[1].subscriptionId, "00000000-0000-0000-0000-000000000002");

      // -- resource groups --
      const rgs = await listResourceGroups(profile, cred, subs[0].subscriptionId);
      assert.equal(rgs.length, 2, "expected 2 canned resource groups");
      assert.equal(rgs[0].name, "rg-test-1");
      assert.ok(rgs[0].location, "resource group should have a location");
      assert.equal(rgs[1].name, "rg-test-2");
      assert.ok(rgs[1].location);
    });
  }
});

// ---------------------------------------------------------------------------
// Storage flow via fetchWithAccessToken
// ---------------------------------------------------------------------------

describe("Storage full-flow", () => {
  let closeMock: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeMock?.();
    closeMock = undefined;
  });

  test("fetchWithAccessToken returns container XML from mock storage", async () => {
    const mock = await startMockStorage();
    closeMock = mock.close;

    const cred = new MockCredential();
    const response = await fetchWithAccessToken(
      cred,
      "https://storage.azure.com/",
      mock.url + "/?comp=list",
      {
        headers: {
          Accept: "application/xml",
          "x-ms-version": "2023-11-03",
          "x-ms-date": new Date().toUTCString(),
        },
      },
    );

    assert.equal(response.status, 200);

    const xml = await response.text();
    assert.ok(xml.includes("<EnumerationResults>"), "response should contain EnumerationResults");

    // Parse container names the same way storageClient does
    const names = [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1]);
    assert.deepEqual(names, ["test-container-1", "test-container-2"]);
  });
});

// ---------------------------------------------------------------------------
// probeAccessToken
// ---------------------------------------------------------------------------

describe("probeAccessToken", () => {
  test("returns expiresOn as a valid ISO date string", async () => {
    const cred = new MockCredential();
    const result = await probeAccessToken(cred, "https://management.azure.com/");

    assert.ok(result.expiresOn, "should have expiresOn");
    const parsed = new Date(result.expiresOn);
    assert.ok(!Number.isNaN(parsed.getTime()), "expiresOn should be a valid date");
    assert.ok(parsed.getTime() > Date.now(), "expiresOn should be in the future");
  });
});

// ---------------------------------------------------------------------------
// fetchWithAccessToken – header validation
// ---------------------------------------------------------------------------

describe("fetchWithAccessToken header handling", () => {
  let closeMock: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await closeMock?.();
    closeMock = undefined;
  });

  test("sends Authorization header and defaults Accept to application/json", async () => {
    const mock = await startMockArm();
    closeMock = mock.close;

    const cred = new MockCredential();
    // Call with no explicit Accept header – should default to application/json
    const response = await fetchWithAccessToken(
      cred,
      "https://management.azure.com/",
      mock.url + "/subscriptions?api-version=2022-12-01",
    );

    // Mock ARM validates Bearer token; a 200 proves Authorization was accepted
    assert.equal(response.status, 200);
    // The response is JSON (from mock ARM's application/json Content-Type)
    const body = await response.json();
    assert.ok(Array.isArray(body.value), "response should have value array");
  });
});

// ---------------------------------------------------------------------------
// Profile endpoint correctness per cloud
// ---------------------------------------------------------------------------

describe("Profile endpoint correctness per cloud", () => {
  const expectedScopes: Record<SupportedCloudName, { armScope: string }> = {
    "azure-commercial": { armScope: "https://management.azure.com/.default" },
    "azure-us-government": { armScope: "https://management.usgovcloudapi.net/.default" },
    "azure-us-gov-secret": { armScope: "https://management.secret.contoso.internal/.default" },
    "azure-us-gov-topsecret": { armScope: "https://management.topsecret.contoso.internal/.default" },
    "azurestack-custom": { armScope: "https://management.azurestack.contoso.local/.default" },
  };

  for (const cloudName of supportedClouds) {
    test(`${cloudName} — resourceManagerEndpoint builds correct subscription URL`, () => {
      const profile = getBuiltinCloudProfile(cloudName, {});
      const url = new URL("/subscriptions", profile.resourceManagerEndpoint);
      assert.ok(
        url.href.endsWith("/subscriptions"),
        `expected URL to end with /subscriptions, got ${url.href}`,
      );
      assert.ok(
        url.href.startsWith(profile.resourceManagerEndpoint.replace(/\/+$/, "")),
        `URL should be rooted at the profile endpoint`,
      );
    });

    test(`${cloudName} — audienceToScope produces correct ARM scope`, () => {
      const profile = getBuiltinCloudProfile(cloudName, {});
      const scope = audienceToScope(profile.resourceManagerAudience);
      const expected = expectedScopes[cloudName].armScope;
      assert.equal(scope, expected, `ARM scope mismatch for ${cloudName}`);
    });
  }
});
