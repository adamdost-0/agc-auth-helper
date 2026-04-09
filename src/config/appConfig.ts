import { resolveAuthMode, type CredentialMode } from "../auth/credentialFactory.js";
import { resolveCloudProfile } from "./cloudProfile.js";

export interface AppConfig {
  port: number;
  defaultCloud: string;
  authMode: CredentialMode;
  subscriptionId?: string;
  storageAccountName?: string;
  customCloudProfilePath?: string;
}

function parsePort(value: string | undefined): number {
  const parsed = Number(value ?? "3000");

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`PORT must be a valid TCP port. Received "${value ?? ""}".`);
  }

  return parsed;
}

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const defaultCloud = env.AZURE_CLOUD ?? "azure-us-government";
  const customCloudProfilePath = env.CUSTOM_CLOUD_PROFILE_PATH ?? undefined;

  resolveCloudProfile({
    name: defaultCloud,
    customProfilePath: customCloudProfilePath,
    env,
  });

  return {
    port: parsePort(env.PORT),
    defaultCloud,
    authMode: resolveAuthMode(env),
    subscriptionId: env.AZURE_SUBSCRIPTION_ID ?? undefined,
    storageAccountName: env.AZURE_STORAGE_ACCOUNT ?? undefined,
    customCloudProfilePath,
  };
}
