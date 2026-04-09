import type { TokenCredential } from "@azure/core-auth";

import type { CloudProfile } from "../config/cloudProfile.js";
import { fetchWithAccessToken } from "./http.js";

export interface BlobContainerSummary {
  name: string;
}

function parseContainerNames(xml: string): BlobContainerSummary[] {
  return [...xml.matchAll(/<Name>([^<]+)<\/Name>/g)].map((match) => ({
    name: match[1],
  }));
}

export async function listBlobContainers(
  profile: CloudProfile,
  credential: TokenCredential,
  storageAccountName: string,
): Promise<BlobContainerSummary[]> {
  const endpoint = `https://${storageAccountName}${profile.serviceDnsSuffixes.storage}/?comp=list`;

  const response = await fetchWithAccessToken(
    credential,
    profile.serviceAudiences.storage,
    endpoint,
    {
      headers: {
        "x-ms-date": new Date().toUTCString(),
        "x-ms-version": "2023-11-03",
        Accept: "application/xml",
      },
    },
  );

  return parseContainerNames(await response.text());
}
