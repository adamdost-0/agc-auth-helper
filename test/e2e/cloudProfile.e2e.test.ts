import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { resolve } from "node:path";

import {
  getBuiltinCloudProfile,
  resolveCloudProfile,
  validateCloudProfile,
  audienceToScope,
  loadCloudProfileFromFile,
  isSupportedCloudName,
  supportedClouds,
  listAvailableCloudProfiles,
} from "../../src/config/cloudProfile.js";
import type { CloudProfile } from "../../src/config/cloudProfile.js";

// ── Helpers ──────────────────────────────────────────────────────────────

function assertValidHttpsUrl(value: string, label: string) {
  const url = new URL(value);
  assert.equal(url.protocol, "https:", `${label} must use HTTPS — got ${value}`);
}

const cloudExpectations = [
  {
    name: "azure-commercial" as const,
    authorityHost: "https://login.microsoftonline.com/",
    resourceManagerEndpoint: "https://management.azure.com/",
    environment: "public",
  },
  {
    name: "azure-us-government" as const,
    authorityHost: "https://login.microsoftonline.us/",
    resourceManagerEndpoint: "https://management.usgovcloudapi.net/",
    environment: "usgovernment",
  },
  {
    name: "azure-us-gov-secret" as const,
    authorityHost: "https://login.secret.contoso.internal/",
    resourceManagerEndpoint: "https://management.secret.contoso.internal/",
    environment: "usgovernmentsecret",
  },
  {
    name: "azure-us-gov-topsecret" as const,
    authorityHost: "https://login.topsecret.contoso.internal/",
    resourceManagerEndpoint: "https://management.topsecret.contoso.internal/",
    environment: "usgovernmenttopsecret",
  },
  {
    name: "azurestack-custom" as const,
    authorityHost: "https://login.azurestack.contoso.local/",
    resourceManagerEndpoint: "https://management.azurestack.contoso.local/",
    environment: "azurestackcloud",
  },
] as const;

// ── 1. Per-cloud contract tests ──────────────────────────────────────────

for (const expected of cloudExpectations) {
  describe(`Cloud profile contract — ${expected.name}`, () => {
    const emptyEnv = {};
    const profile = getBuiltinCloudProfile(expected.name, emptyEnv);

    test("authorityHost is a valid HTTPS URL", () => {
      assertValidHttpsUrl(profile.authorityHost, "authorityHost");
      assert.equal(profile.authorityHost, expected.authorityHost);
    });

    test("resourceManagerEndpoint is a valid HTTPS URL", () => {
      assertValidHttpsUrl(profile.resourceManagerEndpoint, "resourceManagerEndpoint");
      assert.equal(profile.resourceManagerEndpoint, expected.resourceManagerEndpoint);
    });

    test("resourceManagerAudience is a valid HTTPS URL", () => {
      assertValidHttpsUrl(profile.resourceManagerAudience, "resourceManagerAudience");
    });

    test("all 4 DNS suffixes start with '.'", () => {
      const suffixes = profile.serviceDnsSuffixes;
      for (const [key, value] of Object.entries(suffixes)) {
        assert.ok(
          value.startsWith("."),
          `serviceDnsSuffixes.${key} must start with '.' — got "${value}"`,
        );
      }
    });

    test("all 3 service audiences are valid HTTPS URLs", () => {
      const audiences = profile.serviceAudiences;
      for (const [key, value] of Object.entries(audiences)) {
        assertValidHttpsUrl(value, `serviceAudiences.${key}`);
      }
    });

    test(`environment matches "${expected.environment}"`, () => {
      assert.equal(profile.environment, expected.environment);
    });
  });
}

// ── 2. Environment variable override tests ───────────────────────────────

for (const expected of cloudExpectations) {
  describe(`Environment overrides — ${expected.name}`, () => {
    test("AZURE_AUTHORITY_HOST overrides authorityHost", () => {
      const override = "https://custom-authority.example.com/";
      const profile = getBuiltinCloudProfile(expected.name, {
        AZURE_AUTHORITY_HOST: override,
      });
      assert.equal(profile.authorityHost, override);
    });

    test("AZURE_RESOURCE_MANAGER_ENDPOINT overrides resourceManagerEndpoint", () => {
      const override = "https://custom-arm.example.com/";
      const profile = getBuiltinCloudProfile(expected.name, {
        AZURE_RESOURCE_MANAGER_ENDPOINT: override,
      });
      assert.equal(profile.resourceManagerEndpoint, override);
    });

    test("AZURE_RESOURCE_MANAGER_AUDIENCE overrides both resourceManagerAudience and serviceAudiences.arm", () => {
      const override = "https://custom-audience.example.com/";
      const profile = getBuiltinCloudProfile(expected.name, {
        AZURE_RESOURCE_MANAGER_AUDIENCE: override,
      });
      assert.equal(profile.resourceManagerAudience, override);
      assert.equal(profile.serviceAudiences.arm, override);
    });

    test("AZURE_STORAGE_DNS_SUFFIX overrides serviceDnsSuffixes.storage", () => {
      const override = ".blob.custom.example.net";
      const profile = getBuiltinCloudProfile(expected.name, {
        AZURE_STORAGE_DNS_SUFFIX: override,
      });
      assert.equal(profile.serviceDnsSuffixes.storage, override);
    });

    test("AZURE_TENANT_ID sets tenantId", () => {
      const tenantId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
      const profile = getBuiltinCloudProfile(expected.name, {
        AZURE_TENANT_ID: tenantId,
      });
      assert.equal(profile.tenantId, tenantId);
    });
  });
}

// ── 3. Cross-cloud isolation tests ───────────────────────────────────────

describe("Cross-cloud isolation", () => {
  const emptyEnv = {};
  const profiles = cloudExpectations.map((e) =>
    getBuiltinCloudProfile(e.name, emptyEnv),
  );

  test("each cloud returns a different authorityHost", () => {
    const hosts = profiles.map((p) => p.authorityHost);
    assert.equal(new Set(hosts).size, hosts.length, "authorityHost values must be unique");
  });

  test("each cloud returns a different resourceManagerEndpoint", () => {
    const endpoints = profiles.map((p) => p.resourceManagerEndpoint);
    assert.equal(
      new Set(endpoints).size,
      endpoints.length,
      "resourceManagerEndpoint values must be unique",
    );
  });

  test("no two clouds share the same environment value", () => {
    const envs = profiles.map((p) => p.environment);
    assert.equal(new Set(envs).size, envs.length, "environment values must be unique");
  });
});

// ── 4. supportedClouds array & type guard ────────────────────────────────

describe("supportedClouds array and isSupportedCloudName", () => {
  test("supportedClouds contains all 5 expected clouds", () => {
    const expected = [
      "azure-commercial",
      "azure-us-government",
      "azure-us-gov-secret",
      "azure-us-gov-topsecret",
      "azurestack-custom",
    ];
    for (const name of expected) {
      assert.ok(
        supportedClouds.includes(name as any),
        `supportedClouds must include "${name}"`,
      );
    }
    assert.equal(supportedClouds.length, 5, "supportedClouds must have exactly 5 entries");
  });

  test("isSupportedCloudName returns true for each supported cloud", () => {
    for (const name of supportedClouds) {
      assert.equal(isSupportedCloudName(name), true, `isSupportedCloudName("${name}") must be true`);
    }
  });

  test('isSupportedCloudName returns false for "nonexistent"', () => {
    assert.equal(isSupportedCloudName("nonexistent"), false);
  });

  test("isSupportedCloudName returns false for empty string", () => {
    assert.equal(isSupportedCloudName(""), false);
  });
});

// ── 5. Custom profile from file ──────────────────────────────────────────

describe("loadCloudProfileFromFile", () => {
  test("loads azure-us-government.json from cloud-profiles directory", () => {
    const filePath = resolve("cloud-profiles/azure-us-government.json");
    const profile = loadCloudProfileFromFile(filePath);

    assert.equal(profile.name, "azure-us-government");
    assert.equal(profile.environment, "usgovernment");
    assertValidHttpsUrl(profile.authorityHost, "authorityHost");
    assertValidHttpsUrl(profile.resourceManagerEndpoint, "resourceManagerEndpoint");
    assert.ok(
      profile.serviceDnsSuffixes.storage.startsWith("."),
      "storage DNS suffix must start with '.'",
    );
  });

  test("loaded file profile matches built-in profile values", () => {
    const filePath = resolve("cloud-profiles/azure-us-government.json");
    const fileProfile = loadCloudProfileFromFile(filePath);
    const builtinProfile = getBuiltinCloudProfile("azure-us-government", {});

    assert.equal(fileProfile.authorityHost, builtinProfile.authorityHost);
    assert.equal(fileProfile.resourceManagerEndpoint, builtinProfile.resourceManagerEndpoint);
    assert.equal(fileProfile.resourceManagerAudience, builtinProfile.resourceManagerAudience);
    assert.deepEqual(fileProfile.serviceDnsSuffixes, builtinProfile.serviceDnsSuffixes);
    assert.deepEqual(fileProfile.serviceAudiences, builtinProfile.serviceAudiences);
  });
});

// ── 6. Validation error tests ────────────────────────────────────────────

describe("validateCloudProfile — error cases", () => {
  const validBase = getBuiltinCloudProfile("azure-us-government", {});

  test("invalid URL for resourceManagerEndpoint throws", () => {
    assert.throws(
      () =>
        validateCloudProfile({
          ...validBase,
          resourceManagerEndpoint: "not-a-valid-url",
        }),
      /resourceManagerEndpoint/,
    );
  });

  test("missing DNS suffix dot throws", () => {
    assert.throws(
      () =>
        validateCloudProfile({
          ...validBase,
          serviceDnsSuffixes: {
            ...validBase.serviceDnsSuffixes,
            storage: "blob.core.windows.net", // missing leading "."
          },
        }),
      /serviceDnsSuffixes\.storage/,
    );
  });

  test("empty name throws", () => {
    assert.throws(
      () =>
        validateCloudProfile({
          ...validBase,
          name: "",
        }),
      /name/,
    );
  });

  test("whitespace-only name throws", () => {
    assert.throws(
      () =>
        validateCloudProfile({
          ...validBase,
          name: "   ",
        }),
      /name/,
    );
  });

  test("invalid authorityHost throws", () => {
    assert.throws(
      () =>
        validateCloudProfile({
          ...validBase,
          authorityHost: "not-a-url",
        }),
      /authorityHost/,
    );
  });

  test("invalid serviceAudiences.arm throws", () => {
    assert.throws(
      () =>
        validateCloudProfile({
          ...validBase,
          serviceAudiences: {
            ...validBase.serviceAudiences,
            arm: "invalid",
          },
        }),
      /serviceAudiences\.arm/,
    );
  });
});

// ── 7. resolveCloudProfile defaults ──────────────────────────────────────

describe("resolveCloudProfile defaults", () => {
  test("defaults to azure-us-government when no name provided", () => {
    const profile = resolveCloudProfile({ env: {} });
    assert.equal(profile.name, "azure-us-government");
    assert.equal(profile.environment, "usgovernment");
  });

  test("AZURE_CLOUD env var overrides default cloud selection", () => {
    const profile = resolveCloudProfile({
      env: { AZURE_CLOUD: "azure-commercial" },
    });
    assert.equal(profile.name, "azure-commercial");
    assert.equal(profile.environment, "public");
  });

  test("explicit name parameter takes precedence over AZURE_CLOUD", () => {
    const profile = resolveCloudProfile({
      name: "azure-us-gov-secret",
      env: { AZURE_CLOUD: "azure-commercial" },
    });
    assert.equal(profile.name, "azure-us-gov-secret");
    assert.equal(profile.environment, "usgovernmentsecret");
  });

  test("unsupported AZURE_CLOUD value throws with descriptive error", () => {
    assert.throws(
      () => resolveCloudProfile({ env: { AZURE_CLOUD: "azure-china" } }),
      /Unsupported AZURE_CLOUD/,
    );
  });

  test("customProfilePath loads from file instead of built-in", () => {
    const filePath = resolve("cloud-profiles/azure-us-government.json");
    const profile = resolveCloudProfile({
      customProfilePath: filePath,
      env: {},
    });
    assert.equal(profile.name, "azure-us-government");
    assert.equal(profile.environment, "usgovernment");
  });
});

// ── 8. audienceToScope ───────────────────────────────────────────────────

describe("audienceToScope", () => {
  test("appends .default to a trailing-slash audience", () => {
    assert.equal(
      audienceToScope("https://management.usgovcloudapi.net/"),
      "https://management.usgovcloudapi.net/.default",
    );
  });

  test("appends .default to an audience without trailing slash", () => {
    assert.equal(
      audienceToScope("https://management.azure.com"),
      "https://management.azure.com/.default",
    );
  });

  test("works with custom api:// scheme audience", () => {
    assert.equal(
      audienceToScope("api://custom-arm"),
      "api://custom-arm/.default",
    );
  });

  test("works with each cloud's ARM audience", () => {
    const emptyEnv = {};
    for (const expected of cloudExpectations) {
      const profile = getBuiltinCloudProfile(expected.name, emptyEnv);
      const scope = audienceToScope(profile.serviceAudiences.arm);
      assert.ok(scope.endsWith("/.default"), `scope for ${expected.name} must end with /.default`);
      assert.ok(scope.length > "/.default".length, `scope for ${expected.name} must have a prefix`);
    }
  });

  test("works with storage and keyVault audiences", () => {
    const profile = getBuiltinCloudProfile("azure-us-government", {});

    const storageScope = audienceToScope(profile.serviceAudiences.storage);
    assert.equal(storageScope, "https://storage.azure.com/.default");

    const kvScope = audienceToScope(profile.serviceAudiences.keyVault);
    assert.equal(kvScope, "https://vault.azure.net/.default");
  });

  test("strips multiple trailing slashes before appending .default", () => {
    assert.equal(
      audienceToScope("https://management.azure.com///"),
      "https://management.azure.com/.default",
    );
  });
});

// ── 9. listAvailableCloudProfiles ────────────────────────────────────────

describe("listAvailableCloudProfiles", () => {
  test("returns all 5 profiles", () => {
    const profiles = listAvailableCloudProfiles({});
    assert.equal(profiles.length, 5);
  });

  test("each returned profile passes validation", () => {
    const profiles = listAvailableCloudProfiles({});
    for (const profile of profiles) {
      assert.doesNotThrow(() => validateCloudProfile(profile));
    }
  });

  test("returned profiles have unique names", () => {
    const profiles = listAvailableCloudProfiles({});
    const names = profiles.map((p) => p.name);
    assert.equal(new Set(names).size, names.length, "profile names must be unique");
  });
});
