import type { TokenCredential } from "@azure/core-auth";

import { audienceToScope } from "../config/cloudProfile.js";

export async function fetchWithAccessToken(
  credential: TokenCredential,
  audience: string,
  url: URL | string,
  init: RequestInit = {},
): Promise<Response> {
  const token = await credential.getToken(audienceToScope(audience));

  if (!token) {
    throw new Error(`No access token was returned for audience ${audience}.`);
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token.token}`);
  headers.set("Accept", headers.get("Accept") ?? "application/json");

  const response = await fetch(url, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Request to ${response.url} failed with ${response.status} ${response.statusText}: ${body.slice(0, 800)}`,
    );
  }

  return response;
}

export async function probeAccessToken(
  credential: TokenCredential,
  audience: string,
): Promise<{ expiresOn: string }> {
  const token = await credential.getToken(audienceToScope(audience));

  if (!token) {
    throw new Error(`Token acquisition returned no token for ${audience}.`);
  }

  return {
    expiresOn: new Date(token.expiresOnTimestamp).toISOString(),
  };
}
