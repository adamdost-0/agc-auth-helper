import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { createCredentialPlan } from "./auth/credentialFactory.js";
import { listResourceGroups, listSubscriptions } from "./azure/armClient.js";
import { probeAccessToken } from "./azure/http.js";
import { listBlobContainers } from "./azure/storageClient.js";
import { loadAppConfig } from "./config/appConfig.js";
import {
  listAvailableCloudProfiles,
  resolveCloudProfile,
  summarizeCloudProfile,
} from "./config/cloudProfile.js";
import { renderHomePage } from "./server/html.js";
import { resolveRequestIdentity } from "./server/identity.js";

const appConfig = loadAppConfig();

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendHtml(response: ServerResponse, html: string): void {
  response.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(html);
}

function summarizeTlsTrust(): Record<string, boolean> {
  return {
    customCaBundleConfigured: Boolean(process.env.NODE_EXTRA_CA_CERTS?.trim()),
  };
}

function resolveRequestCloud(url: URL) {
  return resolveCloudProfile({
    name: url.searchParams.get("cloud") ?? appConfig.defaultCloud,
    customProfilePath: appConfig.customCloudProfilePath,
  });
}

function requireQueryParam(url: URL, name: string, defaultValue?: string): string {
  const value = url.searchParams.get(name) ?? defaultValue;

  if (!value || value.trim().length === 0) {
    throw new Error(`Query parameter "${name}" is required.`);
  }

  return value.trim();
}

async function handleApiRequest(request: IncomingMessage, response: ServerResponse, url: URL) {
  const cloudProfile = resolveRequestCloud(url);

  if (url.pathname === "/api/whoami") {
    return sendJson(response, 200, resolveRequestIdentity(request.headers));
  }

  if (url.pathname === "/api/profile") {
    return sendJson(response, 200, summarizeCloudProfile(cloudProfile));
  }

  const credentialPlan = createCredentialPlan(cloudProfile);

  if (url.pathname === "/api/diagnostics") {
    const probe = url.searchParams.get("probe") === "true";
      const diagnostics: Record<string, unknown> = {
        ok: true,
        cloudProfile: summarizeCloudProfile(cloudProfile),
        auth: {
          mode: credentialPlan.mode,
          credential: credentialPlan.label,
          guidance: credentialPlan.guidance,
        },
        tls: summarizeTlsTrust(),
        requestIdentity: resolveRequestIdentity(request.headers),
      };

    if (probe) {
      try {
        diagnostics.armTokenProbe = {
          ok: true,
          ...(await probeAccessToken(
            credentialPlan.credential,
            cloudProfile.resourceManagerAudience,
          )),
        };
      } catch (error) {
        diagnostics.armTokenProbe = {
          ok: false,
          error: (error as Error).message,
        };
      }
    }

    return sendJson(response, 200, diagnostics);
  }

  if (url.pathname === "/api/subscriptions") {
    const subscriptions = await listSubscriptions(cloudProfile, credentialPlan.credential);
    return sendJson(response, 200, {
      count: subscriptions.length,
      value: subscriptions,
    });
  }

  if (url.pathname === "/api/resource-groups") {
    const subscriptionId = requireQueryParam(
      url,
      "subscriptionId",
      appConfig.subscriptionId,
    );
    const resourceGroups = await listResourceGroups(
      cloudProfile,
      credentialPlan.credential,
      subscriptionId,
    );
    return sendJson(response, 200, {
      subscriptionId,
      count: resourceGroups.length,
      value: resourceGroups,
    });
  }

  if (url.pathname === "/api/blob-containers") {
    const storageAccount = requireQueryParam(
      url,
      "storageAccount",
      appConfig.storageAccountName,
    );
    const containers = await listBlobContainers(
      cloudProfile,
      credentialPlan.credential,
      storageAccount,
    );
    return sendJson(response, 200, {
      storageAccount,
      count: containers.length,
      value: containers,
    });
  }

  sendJson(response, 404, { error: `No route found for ${url.pathname}.` });
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    return sendJson(response, 400, { error: "Request URL is missing." });
  }

  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

  try {
    if (request.method !== "GET") {
      return sendJson(response, 405, { error: "Only GET requests are supported." });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return sendHtml(
        response,
        renderHomePage({
          defaultCloud: appConfig.defaultCloud,
          subscriptionId: appConfig.subscriptionId,
          storageAccountName: appConfig.storageAccountName,
          authMode: appConfig.authMode,
          clouds: listAvailableCloudProfiles().map((profile) => ({
            name: profile.name,
            displayName: profile.displayName,
            notes: profile.notes,
          })),
        }),
      );
    }

    if (url.pathname === "/healthz") {
      return sendJson(response, 200, {
        status: "ok",
        service: "agc-auth-helper",
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return await handleApiRequest(request, response, url);
    }

    return sendJson(response, 404, { error: `No route found for ${url.pathname}.` });
  } catch (error) {
    return sendJson(response, 500, {
      error: (error as Error).message,
    });
  }
});

server.listen(appConfig.port, () => {
  console.log(
    `Sovereign auth reference app listening on http://localhost:${appConfig.port} using cloud ${appConfig.defaultCloud} and auth mode ${appConfig.authMode}.`,
  );
});
