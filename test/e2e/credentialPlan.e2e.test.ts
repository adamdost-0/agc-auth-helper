import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  resolveAuthMode,
  createCredentialPlan,
} from "../../src/auth/credentialFactory.js";
import type {
  CredentialMode,
  CredentialPlan,
} from "../../src/auth/credentialFactory.js";
import { getBuiltinCloudProfile } from "../../src/config/cloudProfile.js";
import type { SupportedCloudName } from "../../src/config/cloudProfile.js";

// ── helpers ──────────────────────────────────────────────────────────────────

const clouds: SupportedCloudName[] = [
  "azure-commercial",
  "azure-us-government",
  "azure-us-gov-secret",
  "azure-us-gov-topsecret",
  "azurestack-custom",
];

/** Build a minimal, isolated env — no leaking from the real process.env. */
function cleanEnv(overrides: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { ...overrides };
}

const workloadEnv = {
  AZURE_FEDERATED_TOKEN_FILE: "/var/run/secrets/tokens/azure-identity",
  AZURE_CLIENT_ID: "11111111-1111-1111-1111-111111111111",
  AZURE_TENANT_ID: "22222222-2222-2222-2222-222222222222",
};

const clientSecretEnv = {
  AZURE_TENANT_ID: "22222222-2222-2222-2222-222222222222",
  AZURE_CLIENT_ID: "11111111-1111-1111-1111-111111111111",
  AZURE_CLIENT_SECRET: "super-secret-value",
};

// ── 1. resolveAuthMode ───────────────────────────────────────────────────────

describe("resolveAuthMode", () => {
  describe("explicit AUTH_MODE selection", () => {
    const modes: CredentialMode[] = [
      "managedIdentity",
      "workloadIdentity",
      "azureCli",
      "deviceCode",
      "clientSecret",
    ];

    for (const mode of modes) {
      test(`AUTH_MODE=${mode} → returns "${mode}"`, () => {
        assert.equal(resolveAuthMode(cleanEnv({ AUTH_MODE: mode })), mode);
      });
    }

    test("invalid AUTH_MODE throws", () => {
      assert.throws(
        () => resolveAuthMode(cleanEnv({ AUTH_MODE: "bogus" })),
        /not supported/,
      );
    });
  });

  describe("auto-detection priority (no AUTH_MODE)", () => {
    test("workload identity env vars → workloadIdentity", () => {
      assert.equal(resolveAuthMode(cleanEnv(workloadEnv)), "workloadIdentity");
    });

    test("IDENTITY_ENDPOINT → managedIdentity", () => {
      assert.equal(
        resolveAuthMode(cleanEnv({ IDENTITY_ENDPOINT: "http://169.254.169.254/metadata" })),
        "managedIdentity",
      );
    });

    test("MSI_ENDPOINT → managedIdentity", () => {
      assert.equal(
        resolveAuthMode(cleanEnv({ MSI_ENDPOINT: "http://127.0.0.1:41042/MSI/token/" })),
        "managedIdentity",
      );
    });

    test("WEBSITE_SITE_NAME → managedIdentity", () => {
      assert.equal(
        resolveAuthMode(cleanEnv({ WEBSITE_SITE_NAME: "my-app" })),
        "managedIdentity",
      );
    });

    test("no signals → azureCli fallback", () => {
      assert.equal(resolveAuthMode(cleanEnv()), "azureCli");
    });

    test("workload identity takes precedence over managed identity", () => {
      const env = cleanEnv({
        ...workloadEnv,
        IDENTITY_ENDPOINT: "http://169.254.169.254/metadata",
      });
      assert.equal(resolveAuthMode(env), "workloadIdentity");
    });
  });
});

// ── 2. createCredentialPlan — per cloud ──────────────────────────────────────

describe("createCredentialPlan", () => {
  for (const cloud of clouds) {
    describe(`cloud: ${cloud}`, () => {
      const profile = getBuiltinCloudProfile(cloud, {});

      test("AUTH_MODE=azureCli → mode azureCli, label AzureCliCredential", () => {
        const plan = createCredentialPlan(profile, cleanEnv({ AUTH_MODE: "azureCli" }));
        assert.equal(plan.mode, "azureCli");
        assert.equal(plan.label, "AzureCliCredential");
      });

      test("AUTH_MODE=managedIdentity → mode managedIdentity, label ManagedIdentityCredential", () => {
        const plan = createCredentialPlan(
          profile,
          cleanEnv({ AUTH_MODE: "managedIdentity" }),
        );
        assert.equal(plan.mode, "managedIdentity");
        assert.equal(plan.label, "ManagedIdentityCredential");
      });

      test("AUTH_MODE=clientSecret + required env vars → mode clientSecret, label ClientSecretCredential", () => {
        const plan = createCredentialPlan(
          profile,
          cleanEnv({ AUTH_MODE: "clientSecret", ...clientSecretEnv }),
        );
        assert.equal(plan.mode, "clientSecret");
        assert.equal(plan.label, "ClientSecretCredential");
      });

      test("clientSecret without AZURE_CLIENT_SECRET throws", () => {
        assert.throws(
          () =>
            createCredentialPlan(
              profile,
              cleanEnv({
                AUTH_MODE: "clientSecret",
                AZURE_TENANT_ID: "22222222-2222-2222-2222-222222222222",
                AZURE_CLIENT_ID: "11111111-1111-1111-1111-111111111111",
              }),
            ),
          /AZURE_CLIENT_SECRET/,
        );
      });

      test("workloadIdentity without AZURE_FEDERATED_TOKEN_FILE throws", () => {
        assert.throws(
          () =>
            createCredentialPlan(
              profile,
              cleanEnv({
                AUTH_MODE: "workloadIdentity",
                AZURE_TENANT_ID: "22222222-2222-2222-2222-222222222222",
                AZURE_CLIENT_ID: "11111111-1111-1111-1111-111111111111",
              }),
            ),
          /AZURE_FEDERATED_TOKEN_FILE/,
        );
      });

      test("each plan includes a non-empty guidance string", () => {
        const plan = createCredentialPlan(profile, cleanEnv({ AUTH_MODE: "azureCli" }));
        assert.ok(plan.guidance.length > 0, "guidance must be non-empty");
      });
    });
  }
});

// ── 3. managedIdentity with optional clientId ────────────────────────────────

describe("managedIdentity clientId resolution", () => {
  const profile = getBuiltinCloudProfile("azure-us-government", {});

  test("MANAGED_IDENTITY_CLIENT_ID is used when set", () => {
    const plan = createCredentialPlan(
      profile,
      cleanEnv({
        AUTH_MODE: "managedIdentity",
        MANAGED_IDENTITY_CLIENT_ID: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      }),
    );
    assert.equal(plan.mode, "managedIdentity");
    assert.equal(plan.label, "ManagedIdentityCredential");
    assert.ok(plan.credential, "credential must be present");
  });

  test("AZURE_CLIENT_ID is used as fallback", () => {
    const plan = createCredentialPlan(
      profile,
      cleanEnv({
        AUTH_MODE: "managedIdentity",
        AZURE_CLIENT_ID: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
      }),
    );
    assert.equal(plan.mode, "managedIdentity");
    assert.ok(plan.credential, "credential must be present");
  });

  test("system-assigned identity (no client ID) works", () => {
    const plan = createCredentialPlan(
      profile,
      cleanEnv({ AUTH_MODE: "managedIdentity" }),
    );
    assert.equal(plan.mode, "managedIdentity");
    assert.equal(plan.label, "ManagedIdentityCredential");
    assert.ok(plan.credential, "credential must be present");
  });
});
