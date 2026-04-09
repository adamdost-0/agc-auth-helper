import {
  AzureCliCredential,
  ClientSecretCredential,
  DeviceCodeCredential,
  ManagedIdentityCredential,
  WorkloadIdentityCredential,
} from "@azure/identity";
import type { TokenCredential } from "@azure/core-auth";

import type { CloudProfile } from "../config/cloudProfile.js";

export type CredentialMode =
  | "managedIdentity"
  | "workloadIdentity"
  | "azureCli"
  | "deviceCode"
  | "clientSecret";

export interface CredentialPlan {
  mode: CredentialMode;
  label: string;
  guidance: string;
  credential: TokenCredential;
}

const developerClientId = "04b07795-8ddb-461a-bbee-02f9e1bf7b46";

function requireEnv(name: string, env: NodeJS.ProcessEnv): string {
  const value = env[name];

  if (!value || value.trim().length === 0) {
    throw new Error(`Environment variable ${name} is required for this auth mode.`);
  }

  return value.trim();
}

function runningInManagedIdentityHost(env: NodeJS.ProcessEnv): boolean {
  return Boolean(
    env.IDENTITY_ENDPOINT ||
      env.MSI_ENDPOINT ||
      env.WEBSITE_SITE_NAME ||
      env.WEBSITE_INSTANCE_ID ||
      env.IMDS_ENDPOINT,
  );
}

export function resolveAuthMode(env: NodeJS.ProcessEnv = process.env): CredentialMode {
  const configured = env.AUTH_MODE?.trim() as CredentialMode | undefined;

  if (configured) {
    if (
      configured === "managedIdentity" ||
      configured === "workloadIdentity" ||
      configured === "azureCli" ||
      configured === "deviceCode" ||
      configured === "clientSecret"
    ) {
      return configured;
    }

    throw new Error(
      `AUTH_MODE "${configured}" is not supported. Use managedIdentity, workloadIdentity, azureCli, deviceCode, or clientSecret.`,
    );
  }

  if (env.AZURE_FEDERATED_TOKEN_FILE && env.AZURE_CLIENT_ID && env.AZURE_TENANT_ID) {
    return "workloadIdentity";
  }

  if (runningInManagedIdentityHost(env)) {
    return "managedIdentity";
  }

  return "azureCli";
}

export function createCredentialPlan(
  profile: CloudProfile,
  env: NodeJS.ProcessEnv = process.env,
): CredentialPlan {
  const mode = resolveAuthMode(env);

  switch (mode) {
    case "managedIdentity": {
      const clientId = env.MANAGED_IDENTITY_CLIENT_ID ?? env.AZURE_CLIENT_ID;
      const credential = clientId
        ? new ManagedIdentityCredential({ clientId })
        : new ManagedIdentityCredential();

      return {
        mode,
        label: "ManagedIdentityCredential",
        guidance:
          "Preferred for deployed workloads. Assign RBAC to the app's managed identity in the target sovereign cloud.",
        credential,
      };
    }

    case "workloadIdentity": {
      const credential = new WorkloadIdentityCredential({
        tenantId: requireEnv("AZURE_TENANT_ID", env),
        clientId: requireEnv("AZURE_CLIENT_ID", env),
        tokenFilePath: requireEnv("AZURE_FEDERATED_TOKEN_FILE", env),
        authorityHost: profile.authorityHost,
      });

      return {
        mode,
        label: "WorkloadIdentityCredential",
        guidance:
          "Preferred for Kubernetes or federation-based workloads when a projected OIDC token is available.",
        credential,
      };
    }

    case "clientSecret": {
      const credential = new ClientSecretCredential(
        requireEnv("AZURE_TENANT_ID", env),
        requireEnv("AZURE_CLIENT_ID", env),
        requireEnv("AZURE_CLIENT_SECRET", env),
        {
          authorityHost: profile.authorityHost,
        },
      );

      return {
        mode,
        label: "ClientSecretCredential",
        guidance:
          "Use only for controlled local or integration scenarios when managed identity is not available.",
        credential,
      };
    }

    case "deviceCode": {
      const credential = new DeviceCodeCredential({
        tenantId: env.AZURE_TENANT_ID,
        clientId: env.AZURE_CLIENT_ID ?? developerClientId,
        authorityHost: profile.authorityHost,
        userPromptCallback: (info) => {
          console.info(info.message);
        },
      });

      return {
        mode,
        label: "DeviceCodeCredential",
        guidance:
          "Useful for disconnected development hosts when browser sign-in is not practical and the custom authority host must be explicit.",
        credential,
      };
    }

    case "azureCli":
    default: {
      const credential = new AzureCliCredential({
        tenantId: env.AZURE_TENANT_ID,
      });

      return {
        mode: "azureCli",
        label: "AzureCliCredential",
        guidance:
          "Local development mode. Run `az cloud set` and `az login` against the correct sovereign cloud before starting the app.",
        credential,
      };
    }
  }
}
