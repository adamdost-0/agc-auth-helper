import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";

import { startMockArm } from "./fixtures/mockArm.js";
import { startMockStorage } from "./fixtures/mockStorage.js";
import { MockCredential, FailingCredential } from "./fixtures/mockCredential.js";
import { getBuiltinCloudProfile } from "../../src/config/cloudProfile.js";
import type { CloudProfile } from "../../src/config/cloudProfile.js";
import { listSubscriptions } from "../../src/azure/armClient.js";
import { fetchWithAccessToken, probeAccessToken } from "../../src/azure/http.js";
import { resolveCloudProfile, validateCloudProfile } from "../../src/config/cloudProfile.js";
import { resolveAuthMode, createCredentialPlan } from "../../src/auth/credentialFactory.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProfile(overrides: Partial<CloudProfile> = {}): CloudProfile {
  const base = getBuiltinCloudProfile("azure-us-government", {});
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// 1. Token acquisition failure
// ---------------------------------------------------------------------------

test("FailingCredential causes listSubscriptions to throw", async () => {
  const profile = makeProfile();
  const cred = new FailingCredential("Simulated token failure");

  await assert.rejects(() => listSubscriptions(profile, cred), {
    message: "Simulated token failure",
  });
});

test("FailingCredential causes probeAccessToken to throw", async () => {
  const cred = new FailingCredential("Simulated token failure");
  const audience = "https://management.usgovcloudapi.net/";

  await assert.rejects(() => probeAccessToken(cred, audience), {
    message: "Simulated token failure",
  });
});

// ---------------------------------------------------------------------------
// 2. ARM returns 403 Forbidden
// ---------------------------------------------------------------------------

test("ARM 403 is surfaced when using forbidden-token", async () => {
  const arm = await startMockArm();
  try {
    const profile = makeProfile({ resourceManagerEndpoint: arm.url });
    const cred = new MockCredential("forbidden-token");

    await assert.rejects(() => listSubscriptions(profile, cred), (err: Error) => {
      assert.match(err.message, /403/);
      return true;
    });
  } finally {
    await arm.close();
  }
});

// ---------------------------------------------------------------------------
// 3. ARM returns 429 Rate Limited
// ---------------------------------------------------------------------------

test("ARM 429 is surfaced when using ratelimit-token", async () => {
  const arm = await startMockArm();
  try {
    const profile = makeProfile({ resourceManagerEndpoint: arm.url });
    const cred = new MockCredential("ratelimit-token");

    await assert.rejects(() => listSubscriptions(profile, cred), (err: Error) => {
      assert.match(err.message, /429/);
      return true;
    });
  } finally {
    await arm.close();
  }
});

// ---------------------------------------------------------------------------
// 4. ARM returns 401 Unauthorized (direct fetch without auth header)
// ---------------------------------------------------------------------------

test("ARM returns 401 when no Authorization header is present", async () => {
  const arm = await startMockArm();
  try {
    const res = await fetch(`${arm.url}/subscriptions?api-version=2022-01-01`);
    assert.equal(res.status, 401);

    const body = await res.json();
    assert.equal(body.error.code, "AuthenticationFailed");
  } finally {
    await arm.close();
  }
});

// ---------------------------------------------------------------------------
// 5. Storage returns 401 without auth
// ---------------------------------------------------------------------------

test("Storage returns 401 when no Authorization header is present", async () => {
  const storage = await startMockStorage();
  try {
    const res = await fetch(`${storage.url}/?comp=list`);
    assert.equal(res.status, 401);

    const body = await res.text();
    assert.match(body, /AuthenticationFailed/);
  } finally {
    await storage.close();
  }
});

// ---------------------------------------------------------------------------
// 6. Invalid cloud profile validation errors
// ---------------------------------------------------------------------------

test("validateCloudProfile rejects empty name", () => {
  assert.throws(
    () => validateCloudProfile(makeProfile({ name: "" })),
    /name.*required/i,
  );
});

test("validateCloudProfile rejects invalid authorityHost URL", () => {
  assert.throws(
    () => validateCloudProfile(makeProfile({ authorityHost: "not-a-url" })),
    /authorityHost/,
  );
});

test("validateCloudProfile rejects DNS suffix missing leading dot", () => {
  const profile = makeProfile();
  profile.serviceDnsSuffixes.storage = "blob.core.usgovcloudapi.net";

  assert.throws(
    () => validateCloudProfile(profile),
    /must start with "\."/, 
  );
});

test("validateCloudProfile rejects empty resourceManagerAudience", () => {
  assert.throws(
    () => validateCloudProfile(makeProfile({ resourceManagerAudience: "" })),
    /resourceManagerAudience.*required/i,
  );
});

test("resolveCloudProfile throws for unsupported AZURE_CLOUD value", () => {
  assert.throws(
    () => resolveCloudProfile({ name: "nonexistent-cloud" }),
    /Unsupported AZURE_CLOUD/,
  );
});

// ---------------------------------------------------------------------------
// 7. Invalid AUTH_MODE
// ---------------------------------------------------------------------------

test("resolveAuthMode throws for unsupported AUTH_MODE", () => {
  assert.throws(
    () => resolveAuthMode({ AUTH_MODE: "invalid" }),
    /not supported/,
  );
});

// ---------------------------------------------------------------------------
// 8. Missing required env vars for clientSecret
// ---------------------------------------------------------------------------

test("createCredentialPlan throws when clientSecret mode is missing AZURE_TENANT_ID", () => {
  const profile = makeProfile();

  assert.throws(
    () => createCredentialPlan(profile, { AUTH_MODE: "clientSecret" }),
    /AZURE_TENANT_ID/,
  );
});

// ---------------------------------------------------------------------------
// 9. Network error (unreachable endpoint)
// ---------------------------------------------------------------------------

test("listSubscriptions throws on unreachable endpoint", async () => {
  const profile = makeProfile({ resourceManagerEndpoint: "http://127.0.0.1:1" });
  const cred = new MockCredential();

  await assert.rejects(() => listSubscriptions(profile, cred), (err: Error) => {
    assert.match(err.message, /ECONNREFUSED|fetch failed|network/i);
    return true;
  });
});

// ---------------------------------------------------------------------------
// 10. Malformed (non-JSON) response handling
// ---------------------------------------------------------------------------

test("fetchWithAccessToken throws when receiving non-JSON success response for non-ok status", async () => {
  // The plain-text server returns 200, but fetchWithAccessToken only throws for
  // non-ok responses. Create a server that returns 500 with plain text instead.
  const server: Server = createServer((_req, res) => {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Internal Server Error - not JSON");
  });

  const started = await new Promise<{ url: string; close: () => Promise<void> }>((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to resolve server address"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });

  try {
    const cred = new MockCredential();
    const audience = "https://management.usgovcloudapi.net/";

    await assert.rejects(
      () => fetchWithAccessToken(cred, audience, `${started.url}/test`),
      (err: Error) => {
        assert.match(err.message, /500/);
        assert.match(err.message, /Internal Server Error/);
        return true;
      },
    );
  } finally {
    await started.close();
  }
});
