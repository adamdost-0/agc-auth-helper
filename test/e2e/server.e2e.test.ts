import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";

import { startTestServer, type TestServer } from "./fixtures/testServer.js";

let server: TestServer;

before(async () => {
  server = await startTestServer({
    AUTH_MODE: "azureCli",
    AZURE_CLOUD: "azure-us-government",
  });
});

after(async () => {
  await server.close();
});

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

describe("GET /healthz", () => {
  it("returns 200 with status ok", async () => {
    const res = await fetch(`${server.url}/healthz`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.equal(body.service, "sovereign-auth-reference");
  });
});

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

describe("GET /", () => {
  it("returns HTML containing 'sovereign'", async () => {
    const res = await fetch(`${server.url}/`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.get("content-type")?.includes("text/html"));
    const html = await res.text();
    assert.ok(/sovereign/i.test(html), "HTML body should contain 'sovereign'");
  });
});

// ---------------------------------------------------------------------------
// Cloud profiles
// ---------------------------------------------------------------------------

const cloudExpectations: Array<{
  cloud: string;
  environment: string;
}> = [
  { cloud: "azure-commercial", environment: "public" },
  { cloud: "azure-us-government", environment: "usgovernment" },
  { cloud: "azure-us-gov-secret", environment: "usgovernmentsecret" },
  { cloud: "azure-us-gov-topsecret", environment: "usgovernmenttopsecret" },
  { cloud: "azurestack-custom", environment: "azurestackcloud" },
];

describe("GET /api/profile", () => {
  for (const { cloud, environment } of cloudExpectations) {
    it(`returns profile for ${cloud}`, async () => {
      const res = await fetch(`${server.url}/api/profile?cloud=${cloud}`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.name, cloud);
      assert.equal(body.environment, environment);
    });
  }
});

// ---------------------------------------------------------------------------
// Whoami — local-dev fallback
// ---------------------------------------------------------------------------

describe("GET /api/whoami", () => {
  it("returns local-dev identity when no auth headers are set", async () => {
    const res = await fetch(`${server.url}/api/whoami`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, "local-dev");
    assert.equal(body.authenticated, true);
  });

  it("returns proxy-headers identity when x-ms-client-principal-name is set", async () => {
    const res = await fetch(`${server.url}/api/whoami`, {
      headers: { "x-ms-client-principal-name": "testuser@contoso.com" },
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.principalName, "testuser@contoso.com");
    assert.equal(body.source, "proxy-headers");
    assert.equal(body.authenticated, true);
  });
});

// ---------------------------------------------------------------------------
// Diagnostics (no probe)
// ---------------------------------------------------------------------------

describe("GET /api/diagnostics", () => {
  it("returns diagnostics without token probe", async () => {
    const res = await fetch(`${server.url}/api/diagnostics`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.cloudProfile, "response should include cloudProfile");
    assert.ok(body.auth, "response should include auth");
  });
});

// ---------------------------------------------------------------------------
// 404 for unknown path
// ---------------------------------------------------------------------------

describe("unknown route", () => {
  it("returns 404 with error property", async () => {
    const res = await fetch(`${server.url}/api/nonexistent`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.ok(body.error, "response should include error");
  });
});

// ---------------------------------------------------------------------------
// 405 for non-GET methods
// ---------------------------------------------------------------------------

describe("non-GET method", () => {
  it("returns 405 for POST /healthz", async () => {
    const res = await fetch(`${server.url}/healthz`, { method: "POST" });
    assert.equal(res.status, 405);
    const body = await res.json();
    assert.ok(body.error, "response should include error");
  });
});
