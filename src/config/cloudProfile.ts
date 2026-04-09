import { readFileSync } from "node:fs";
import { resolve as resolvePath } from "node:path";

export type CloudEnvironment =
  | "public"
  | "usgovernment"
  | "usgovernmentsecret"
  | "usgovernmenttopsecret"
  | "azurestackcloud"
  | "custom";

export interface ServiceDnsSuffixes {
  storage: string;
  keyVault: string;
  sqlServer: string;
  containerRegistry: string;
}

export interface ServiceAudiences {
  arm: string;
  storage: string;
  keyVault: string;
}

export interface CloudProfile {
  name: string;
  displayName: string;
  environment: CloudEnvironment;
  authorityHost: string;
  resourceManagerEndpoint: string;
  resourceManagerAudience: string;
  tenantId?: string;
  portalUrl?: string;
  metadataEndpoint?: string;
  serviceDnsSuffixes: ServiceDnsSuffixes;
  serviceAudiences: ServiceAudiences;
  notes?: string;
}

export const supportedClouds = [
  "azure-commercial",
  "azure-us-government",
  "azure-us-gov-secret",
  "azure-us-gov-topsecret",
  "azurestack-custom",
] as const;

export type SupportedCloudName = (typeof supportedClouds)[number];

const builtinProfiles: Record<SupportedCloudName, CloudProfile> = {
  "azure-commercial": {
    name: "azure-commercial",
    displayName: "Azure Commercial (Public)",
    environment: "public",
    authorityHost: "https://login.microsoftonline.com/",
    resourceManagerEndpoint: "https://management.azure.com/",
    resourceManagerAudience: "https://management.azure.com/",
    serviceDnsSuffixes: {
      storage: ".blob.core.windows.net",
      keyVault: ".vault.azure.net",
      sqlServer: ".database.windows.net",
      containerRegistry: ".azurecr.io",
    },
    serviceAudiences: {
      arm: "https://management.azure.com/",
      storage: "https://storage.azure.com/",
      keyVault: "https://vault.azure.net/",
    },
    portalUrl: "https://portal.azure.com/",
    notes: "Azure Commercial (Public) cloud defaults. Use for development and non-government workloads.",
  },
  "azure-us-government": {
    name: "azure-us-government",
    displayName: "Azure Government",
    environment: "usgovernment",
    authorityHost: "https://login.microsoftonline.us/",
    resourceManagerEndpoint: "https://management.usgovcloudapi.net/",
    resourceManagerAudience: "https://management.usgovcloudapi.net/",
    serviceDnsSuffixes: {
      storage: ".blob.core.usgovcloudapi.net",
      keyVault: ".vault.usgovcloudapi.net",
      sqlServer: ".database.usgovcloudapi.net",
      containerRegistry: ".azurecr.us",
    },
    serviceAudiences: {
      arm: "https://management.usgovcloudapi.net/",
      storage: "https://storage.azure.com/",
      keyVault: "https://vault.azure.net/",
    },
    portalUrl: "https://portal.azure.us/",
    notes: "Azure Government defaults.",
  },
  "azure-us-gov-secret": {
    name: "azure-us-gov-secret",
    displayName: "Azure Government Secret",
    environment: "usgovernmentsecret",
    authorityHost: "https://login.secret.contoso.internal/",
    resourceManagerEndpoint: "https://management.secret.contoso.internal/",
    resourceManagerAudience: "https://management.secret.contoso.internal/",
    serviceDnsSuffixes: {
      storage: ".blob.core.secret.contoso.internal",
      keyVault: ".vault.secret.contoso.internal",
      sqlServer: ".database.secret.contoso.internal",
      containerRegistry: ".azurecr.secret.contoso.internal",
    },
    serviceAudiences: {
      arm: "https://management.secret.contoso.internal/",
      storage: "https://storage.secret.contoso.internal/",
      keyVault: "https://vault.secret.contoso.internal/",
    },
    notes:
      "Replace the placeholder Secret endpoints and audiences with the exact enclave values before deployment.",
  },
  "azure-us-gov-topsecret": {
    name: "azure-us-gov-topsecret",
    displayName: "Azure Government Top Secret",
    environment: "usgovernmenttopsecret",
    authorityHost: "https://login.topsecret.contoso.internal/",
    resourceManagerEndpoint: "https://management.topsecret.contoso.internal/",
    resourceManagerAudience: "https://management.topsecret.contoso.internal/",
    serviceDnsSuffixes: {
      storage: ".blob.core.topsecret.contoso.internal",
      keyVault: ".vault.topsecret.contoso.internal",
      sqlServer: ".database.topsecret.contoso.internal",
      containerRegistry: ".azurecr.topsecret.contoso.internal",
    },
    serviceAudiences: {
      arm: "https://management.topsecret.contoso.internal/",
      storage: "https://storage.topsecret.contoso.internal/",
      keyVault: "https://vault.topsecret.contoso.internal/",
    },
    notes:
      "Replace the placeholder Top Secret endpoints and audiences with the approved values for the target environment.",
  },
  "azurestack-custom": {
    name: "azurestack-custom",
    displayName: "Azure Stack custom cloud",
    environment: "azurestackcloud",
    authorityHost: "https://login.azurestack.contoso.local/",
    resourceManagerEndpoint: "https://management.azurestack.contoso.local/",
    resourceManagerAudience: "https://management.azurestack.contoso.local/",
    serviceDnsSuffixes: {
      storage: ".blob.storage.azurestack.contoso.local",
      keyVault: ".vault.azurestack.contoso.local",
      sqlServer: ".database.azurestack.contoso.local",
      containerRegistry: ".azurecr.azurestack.contoso.local",
    },
    serviceAudiences: {
      arm: "https://management.azurestack.contoso.local/",
      storage: "https://storage.azurestack.contoso.local/",
      keyVault: "https://vault.azurestack.contoso.local/",
    },
    notes:
      "Use for AzureStackCloud-style environments where the management endpoint and audience differ from Azure public defaults.",
  },
};

function ensureText(value: string | undefined, fieldName: string): string {
  if (!value || value.trim().length === 0) {
    throw new Error(`Cloud profile field "${fieldName}" is required.`);
  }

  return value.trim();
}

function ensureAbsoluteUrl(value: string | undefined, fieldName: string): string {
  const trimmed = ensureText(value, fieldName);

  try {
    const url = new URL(trimmed);
    return url.href.endsWith("/") ? url.href : `${url.href}/`;
  } catch (error) {
    throw new Error(
      `Cloud profile field "${fieldName}" must be a valid absolute URL. ${(error as Error).message}`,
    );
  }
}

function ensureDnsSuffix(value: string | undefined, fieldName: string): string {
  const trimmed = ensureText(value, fieldName);

  if (!trimmed.startsWith(".")) {
    throw new Error(
      `Cloud profile field "${fieldName}" must start with "." so it can be appended to a service name.`,
    );
  }

  return trimmed;
}

function withEnvironmentOverrides(
  profile: CloudProfile,
  env: NodeJS.ProcessEnv,
): CloudProfile {
  const armAudienceOverride =
    env.AZURE_RESOURCE_MANAGER_AUDIENCE ?? env.AZURE_ARM_AUDIENCE;

  return {
    ...profile,
    authorityHost: env.AZURE_AUTHORITY_HOST ?? profile.authorityHost,
    resourceManagerEndpoint:
      env.AZURE_RESOURCE_MANAGER_ENDPOINT ?? profile.resourceManagerEndpoint,
    resourceManagerAudience: armAudienceOverride ?? profile.resourceManagerAudience,
    tenantId: env.AZURE_TENANT_ID ?? profile.tenantId,
    serviceDnsSuffixes: {
      storage: env.AZURE_STORAGE_DNS_SUFFIX ?? profile.serviceDnsSuffixes.storage,
      keyVault: env.AZURE_KEYVAULT_DNS_SUFFIX ?? profile.serviceDnsSuffixes.keyVault,
      sqlServer: env.AZURE_SQL_DNS_SUFFIX ?? profile.serviceDnsSuffixes.sqlServer,
      containerRegistry:
        env.AZURE_ACR_DNS_SUFFIX ?? profile.serviceDnsSuffixes.containerRegistry,
    },
    serviceAudiences: {
      arm: armAudienceOverride ?? profile.serviceAudiences.arm,
      storage: env.AZURE_STORAGE_AUDIENCE ?? profile.serviceAudiences.storage,
      keyVault: env.AZURE_KEYVAULT_AUDIENCE ?? profile.serviceAudiences.keyVault,
    },
  };
}

export function isSupportedCloudName(value: string): value is SupportedCloudName {
  return (supportedClouds as readonly string[]).includes(value);
}

export function validateCloudProfile(profile: CloudProfile): CloudProfile {
  const resourceManagerAudience = ensureAbsoluteUrl(
    profile.resourceManagerAudience,
    "resourceManagerAudience",
  );

  return {
    ...profile,
    name: ensureText(profile.name, "name"),
    displayName: ensureText(profile.displayName, "displayName"),
    authorityHost: ensureAbsoluteUrl(profile.authorityHost, "authorityHost"),
    resourceManagerEndpoint: ensureAbsoluteUrl(
      profile.resourceManagerEndpoint,
      "resourceManagerEndpoint",
    ),
    resourceManagerAudience,
    tenantId: profile.tenantId?.trim() || undefined,
    portalUrl: profile.portalUrl
      ? ensureAbsoluteUrl(profile.portalUrl, "portalUrl")
      : undefined,
    metadataEndpoint: profile.metadataEndpoint
      ? ensureAbsoluteUrl(profile.metadataEndpoint, "metadataEndpoint")
      : undefined,
    serviceDnsSuffixes: {
      storage: ensureDnsSuffix(profile.serviceDnsSuffixes.storage, "serviceDnsSuffixes.storage"),
      keyVault: ensureDnsSuffix(
        profile.serviceDnsSuffixes.keyVault,
        "serviceDnsSuffixes.keyVault",
      ),
      sqlServer: ensureDnsSuffix(
        profile.serviceDnsSuffixes.sqlServer,
        "serviceDnsSuffixes.sqlServer",
      ),
      containerRegistry: ensureDnsSuffix(
        profile.serviceDnsSuffixes.containerRegistry,
        "serviceDnsSuffixes.containerRegistry",
      ),
    },
    serviceAudiences: {
      arm: ensureAbsoluteUrl(profile.serviceAudiences.arm, "serviceAudiences.arm"),
      storage: ensureAbsoluteUrl(
        profile.serviceAudiences.storage,
        "serviceAudiences.storage",
      ),
      keyVault: ensureAbsoluteUrl(
        profile.serviceAudiences.keyVault,
        "serviceAudiences.keyVault",
      ),
    },
  };
}

export function getBuiltinCloudProfile(
  name: SupportedCloudName,
  env: NodeJS.ProcessEnv = process.env,
): CloudProfile {
  return validateCloudProfile(withEnvironmentOverrides(builtinProfiles[name], env));
}

export function listAvailableCloudProfiles(
  env: NodeJS.ProcessEnv = process.env,
): CloudProfile[] {
  return supportedClouds.map((name) => getBuiltinCloudProfile(name, env));
}

export function loadCloudProfileFromFile(filePath: string): CloudProfile {
  const absolutePath = resolvePath(filePath);
  const content = readFileSync(absolutePath, "utf8");
  const parsed = JSON.parse(content) as CloudProfile;
  return validateCloudProfile(parsed);
}

export function resolveCloudProfile(options?: {
  name?: string;
  customProfilePath?: string;
  env?: NodeJS.ProcessEnv;
}): CloudProfile {
  const env = options?.env ?? process.env;
  const customProfilePath =
    options?.customProfilePath ?? env.CUSTOM_CLOUD_PROFILE_PATH ?? undefined;

  if (customProfilePath) {
    return loadCloudProfileFromFile(customProfilePath);
  }

  const requestedName = options?.name ?? env.AZURE_CLOUD ?? "azure-us-government";

  if (!isSupportedCloudName(requestedName)) {
    throw new Error(
      `Unsupported AZURE_CLOUD "${requestedName}". Supported values: ${supportedClouds.join(
        ", ",
      )}, or set CUSTOM_CLOUD_PROFILE_PATH to a JSON file.`,
    );
  }

  return getBuiltinCloudProfile(requestedName, env);
}

export function audienceToScope(audience: string): string {
  const normalizedAudience = ensureText(audience, "audience").replace(/\/+$/, "");
  return `${normalizedAudience}/.default`;
}

export function summarizeCloudProfile(profile: CloudProfile) {
  return {
    name: profile.name,
    displayName: profile.displayName,
    environment: profile.environment,
    authorityHost: profile.authorityHost,
    resourceManagerEndpoint: profile.resourceManagerEndpoint,
    resourceManagerAudience: profile.resourceManagerAudience,
    serviceDnsSuffixes: profile.serviceDnsSuffixes,
    serviceAudiences: profile.serviceAudiences,
    notes: profile.notes,
  };
}
