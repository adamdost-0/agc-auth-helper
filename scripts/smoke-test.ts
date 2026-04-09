import { createCredentialPlan } from "../src/auth/credentialFactory.js";
import {
  probeAccessToken,
} from "../src/azure/http.js";
import {
  resolveCloudProfile,
  supportedClouds,
  summarizeCloudProfile,
} from "../src/config/cloudProfile.js";

function getFlagValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const runAll = process.argv.includes("--all");
  const checkToken = process.argv.includes("--check-token");
  const selectedCloud = getFlagValue("--cloud") ?? process.env.AZURE_CLOUD ?? "azure-us-government";
  const clouds = runAll ? [...supportedClouds] : [selectedCloud];

  for (const cloudName of clouds) {
    const profile = resolveCloudProfile({
      name: cloudName,
      customProfilePath: process.env.CUSTOM_CLOUD_PROFILE_PATH,
    });

    console.log(`\n[profile] ${cloudName}`);
    console.log(JSON.stringify(summarizeCloudProfile(profile), null, 2));

    if (checkToken) {
      const credentialPlan = createCredentialPlan(profile);

      try {
        const tokenMetadata = await probeAccessToken(
          credentialPlan.credential,
          profile.resourceManagerAudience,
        );
        console.log(
          `[token] ok via ${credentialPlan.label}; expires ${tokenMetadata.expiresOn}`,
        );
      } catch (error) {
        console.error(`[token] failed via ${credentialPlan.label}: ${(error as Error).message}`);
        process.exitCode = 1;
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
