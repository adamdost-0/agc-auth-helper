import type { TokenCredential } from "@azure/core-auth";

import type { CloudProfile } from "../config/cloudProfile.js";
import { fetchWithAccessToken } from "./http.js";

interface ArmCollectionResponse<T> {
  value?: T[];
}

interface SubscriptionResource {
  subscriptionId: string;
  displayName: string;
  state: string;
  tenantId?: string;
}

interface ResourceGroupResource {
  id: string;
  name: string;
  location: string;
  tags?: Record<string, string>;
}

export async function listSubscriptions(
  profile: CloudProfile,
  credential: TokenCredential,
): Promise<SubscriptionResource[]> {
  const url = new URL("/subscriptions", profile.resourceManagerEndpoint);
  url.searchParams.set("api-version", "2022-12-01");

  const response = await fetchWithAccessToken(
    credential,
    profile.resourceManagerAudience,
    url,
  );

  const payload = (await response.json()) as ArmCollectionResponse<SubscriptionResource>;
  return payload.value ?? [];
}

export async function listResourceGroups(
  profile: CloudProfile,
  credential: TokenCredential,
  subscriptionId: string,
): Promise<ResourceGroupResource[]> {
  const url = new URL(
    `/subscriptions/${subscriptionId}/resourcegroups`,
    profile.resourceManagerEndpoint,
  );
  url.searchParams.set("api-version", "2022-09-01");

  const response = await fetchWithAccessToken(
    credential,
    profile.resourceManagerAudience,
    url,
  );

  const payload = (await response.json()) as ArmCollectionResponse<ResourceGroupResource>;
  return payload.value ?? [];
}
