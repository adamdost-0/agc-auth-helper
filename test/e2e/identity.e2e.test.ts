import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveRequestIdentity, type RequestIdentity } from "../../src/server/identity.js";

function encodeClientPrincipal(principal: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(principal)).toString("base64");
}

describe("resolveRequestIdentity — Easy Auth", () => {
  it("resolves full Easy Auth principal with preferred_username claim", () => {
    const principal = {
      auth_typ: "aad",
      claims: [
        { typ: "preferred_username", val: "alice@contoso.com" },
        { typ: "name", val: "Alice" },
      ],
      user_id: "user-principal-id-123",
    };

    const result = resolveRequestIdentity({
      "x-ms-client-principal": encodeClientPrincipal(principal),
    });

    assert.equal(result.source, "easy-auth");
    assert.equal(result.authenticated, true);
    assert.equal(result.principalName, "alice@contoso.com");
    assert.equal(result.principalId, "user-principal-id-123");
    assert.equal(result.provider, "aad");
  });

  it("resolves claim type http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name", () => {
    const principal = {
      auth_typ: "aad",
      claims: [
        { typ: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name", val: "bob@contoso.com" },
      ],
      user_id: "bob-id",
    };

    const result = resolveRequestIdentity({
      "x-ms-client-principal": encodeClientPrincipal(principal),
    });

    assert.equal(result.authenticated, true);
    assert.equal(result.principalName, "bob@contoso.com");
    assert.equal(result.source, "easy-auth");
  });

  it("resolves claim type 'name' as fallback", () => {
    const principal = {
      auth_typ: "aad",
      claims: [{ typ: "name", val: "Charlie" }],
      user_id: "charlie-id",
    };

    const result = resolveRequestIdentity({
      "x-ms-client-principal": encodeClientPrincipal(principal),
    });

    assert.equal(result.authenticated, true);
    assert.equal(result.principalName, "Charlie");
    assert.equal(result.source, "easy-auth");
  });

  it("x-ms-client-principal-name takes precedence over claims in principal payload", () => {
    const principal = {
      auth_typ: "aad",
      claims: [{ typ: "preferred_username", val: "from-claims@contoso.com" }],
      user_id: "uid-1",
    };

    const result = resolveRequestIdentity({
      "x-ms-client-principal": encodeClientPrincipal(principal),
      "x-ms-client-principal-name": "from-header@contoso.com",
    });

    assert.equal(result.source, "easy-auth");
    assert.equal(result.principalName, "from-header@contoso.com");
  });

  it("extracts principalId from x-ms-client-principal-id header over payload user_id", () => {
    const principal = {
      auth_typ: "aad",
      claims: [{ typ: "preferred_username", val: "user@contoso.com" }],
      user_id: "payload-uid",
    };

    const result = resolveRequestIdentity({
      "x-ms-client-principal": encodeClientPrincipal(principal),
      "x-ms-client-principal-id": "header-uid",
    });

    assert.equal(result.principalId, "header-uid");
  });

  it("falls back to user_id from payload when x-ms-client-principal-id is absent", () => {
    const principal = {
      auth_typ: "aad",
      claims: [{ typ: "preferred_username", val: "user@contoso.com" }],
      user_id: "payload-uid",
    };

    const result = resolveRequestIdentity({
      "x-ms-client-principal": encodeClientPrincipal(principal),
    });

    assert.equal(result.principalId, "payload-uid");
  });

  it("extracts provider from x-ms-client-principal-idp header over payload auth_typ", () => {
    const principal = {
      auth_typ: "aad",
      claims: [{ typ: "preferred_username", val: "user@contoso.com" }],
    };

    const result = resolveRequestIdentity({
      "x-ms-client-principal": encodeClientPrincipal(principal),
      "x-ms-client-principal-idp": "google",
    });

    assert.equal(result.provider, "google");
  });

  it("falls back to auth_typ from payload when x-ms-client-principal-idp is absent", () => {
    const principal = {
      auth_typ: "aad",
      claims: [{ typ: "preferred_username", val: "user@contoso.com" }],
    };

    const result = resolveRequestIdentity({
      "x-ms-client-principal": encodeClientPrincipal(principal),
    });

    assert.equal(result.provider, "aad");
  });

  it("defaults provider to 'Microsoft Entra ID' when no idp header or auth_typ", () => {
    const principal = {
      claims: [{ typ: "preferred_username", val: "user@contoso.com" }],
    };

    const result = resolveRequestIdentity({
      "x-ms-client-principal": encodeClientPrincipal(principal),
    });

    assert.equal(result.provider, "Microsoft Entra ID");
  });
});

describe("resolveRequestIdentity — Proxy Headers", () => {
  it("resolves from x-ms-client-principal-name when no Easy Auth payload", () => {
    const result = resolveRequestIdentity({
      "x-ms-client-principal-name": "proxy-user@contoso.com",
    });

    assert.equal(result.source, "proxy-headers");
    assert.equal(result.authenticated, true);
    assert.equal(result.principalName, "proxy-user@contoso.com");
  });

  it("resolves from x-forwarded-preferred-username when no other identity", () => {
    const result = resolveRequestIdentity({
      "x-forwarded-preferred-username": "forwarded@contoso.com",
    });

    assert.equal(result.source, "proxy-headers");
    assert.equal(result.authenticated, true);
    assert.equal(result.principalName, "forwarded@contoso.com");
  });

  it("x-ms-client-principal-name takes precedence over x-forwarded-preferred-username", () => {
    const result = resolveRequestIdentity({
      "x-ms-client-principal-name": "principal@contoso.com",
      "x-forwarded-preferred-username": "forwarded@contoso.com",
    });

    assert.equal(result.principalName, "principal@contoso.com");
    assert.equal(result.source, "proxy-headers");
  });
});

describe("resolveRequestIdentity — Local Dev Fallback", () => {
  it("returns local-dev identity when no headers and NODE_ENV is not production", () => {
    const result = resolveRequestIdentity({}, { NODE_ENV: "development" });

    assert.equal(result.source, "local-dev");
    assert.equal(result.authenticated, true);
    assert.equal(result.principalName, "local.operator@contoso.mil");
    assert.equal(result.provider, "Local development");
  });

  it("uses default principalName local.operator@contoso.mil", () => {
    const result = resolveRequestIdentity({}, {});

    assert.equal(result.principalName, "local.operator@contoso.mil");
    assert.equal(result.authenticated, true);
  });

  it("LOCAL_OPERATOR_NAME env var overrides default principalName", () => {
    const result = resolveRequestIdentity({}, { LOCAL_OPERATOR_NAME: "ops@agency.gov" });

    assert.equal(result.principalName, "ops@agency.gov");
    assert.equal(result.source, "local-dev");
  });

  it("returns unauthenticated in production with no identity headers", () => {
    const result = resolveRequestIdentity({}, { NODE_ENV: "production" });

    assert.equal(result.authenticated, false);
    assert.equal(result.source, "local-dev");
    assert.equal(result.provider, undefined);
  });
});

describe("resolveRequestIdentity — Malformed Easy Auth", () => {
  it("falls through gracefully on invalid base64", () => {
    const result = resolveRequestIdentity(
      { "x-ms-client-principal": "%%%not-base64%%%" },
      {},
    );

    // Invalid base64 → parseEasyAuthPrincipal returns undefined → falls to local-dev
    assert.equal(result.source, "local-dev");
    assert.equal(result.authenticated, true);
  });

  it("falls through gracefully on valid base64 but invalid JSON", () => {
    const notJson = Buffer.from("this is not json").toString("base64");
    const result = resolveRequestIdentity(
      { "x-ms-client-principal": notJson },
      {},
    );

    assert.equal(result.source, "local-dev");
    assert.equal(result.authenticated, true);
  });

  it("falls through to proxy headers when claims have no matching type", () => {
    const principal = {
      auth_typ: "aad",
      claims: [{ typ: "unknown_claim", val: "irrelevant" }],
    };

    const result = resolveRequestIdentity({
      "x-ms-client-principal": encodeClientPrincipal(principal),
      "x-ms-client-principal-name": "fallback@contoso.com",
    });

    // Name comes from x-ms-client-principal-name, but x-ms-client-principal is present → easy-auth
    assert.equal(result.source, "easy-auth");
    assert.equal(result.principalName, "fallback@contoso.com");
    assert.equal(result.authenticated, true);
  });

  it("falls through to local-dev when claims have no matching type and no proxy headers", () => {
    const principal = {
      auth_typ: "aad",
      claims: [{ typ: "unknown_claim", val: "irrelevant" }],
    };

    const result = resolveRequestIdentity(
      { "x-ms-client-principal": encodeClientPrincipal(principal) },
      {},
    );

    // No principalName resolved → local-dev fallback
    assert.equal(result.source, "local-dev");
    assert.equal(result.authenticated, true);
  });

  it("handles empty claims array gracefully", () => {
    const principal = { auth_typ: "aad", claims: [] };

    const result = resolveRequestIdentity(
      { "x-ms-client-principal": encodeClientPrincipal(principal) },
      {},
    );

    assert.equal(result.source, "local-dev");
    assert.equal(result.authenticated, true);
  });
});
