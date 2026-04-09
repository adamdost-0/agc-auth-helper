import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";

const CANNED_SUBSCRIPTIONS = {
  value: [
    {
      id: "/subscriptions/00000000-0000-0000-0000-000000000001",
      subscriptionId: "00000000-0000-0000-0000-000000000001",
      displayName: "Test Subscription 1",
      state: "Enabled",
    },
    {
      id: "/subscriptions/00000000-0000-0000-0000-000000000002",
      subscriptionId: "00000000-0000-0000-0000-000000000002",
      displayName: "Test Subscription 2",
      state: "Enabled",
    },
  ],
};

const CANNED_RESOURCE_GROUPS = {
  value: [
    {
      id: "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/rg-test-1",
      name: "rg-test-1",
      location: "usgovvirginia",
      properties: { provisioningState: "Succeeded" },
    },
    {
      id: "/subscriptions/00000000-0000-0000-0000-000000000001/resourceGroups/rg-test-2",
      name: "rg-test-2",
      location: "usgovarizona",
      properties: { provisioningState: "Succeeded" },
    },
  ],
};

function sendJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function validateAuth(req: IncomingMessage, res: ServerResponse): boolean {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendJson(res, 401, { error: { code: "AuthenticationFailed", message: "Missing bearer token." } });
    return false;
  }

  const token = authHeader.slice("Bearer ".length);

  if (token === "forbidden-token") {
    sendJson(res, 403, { error: { code: "AuthorizationFailed", message: "Forbidden." } });
    return false;
  }

  if (token === "ratelimit-token") {
    res.writeHead(429, {
      "content-type": "application/json",
      "retry-after": "1",
    });
    res.end(JSON.stringify({ error: { code: "TooManyRequests", message: "Rate limit exceeded." } }));
    return false;
  }

  return true;
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (!validateAuth(req, res)) return;

  // GET /subscriptions?api-version=*
  if (/^\/subscriptions\/?$/.test(url.pathname) && req.method === "GET") {
    return sendJson(res, 200, CANNED_SUBSCRIPTIONS);
  }

  // GET /subscriptions/:id/resourcegroups?api-version=*
  const rgMatch = url.pathname.match(/^\/subscriptions\/([^/]+)\/resourcegroups\/?$/i);
  if (rgMatch && req.method === "GET") {
    return sendJson(res, 200, CANNED_RESOURCE_GROUPS);
  }

  sendJson(res, 404, { error: { code: "NotFound", message: `No route: ${url.pathname}` } });
}

export async function startMockArm(): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer(handleRequest);

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to resolve server address"));
        return;
      }
      const url = `http://127.0.0.1:${addr.port}`;
      resolve({
        url,
        close: () => new Promise<void>((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}
