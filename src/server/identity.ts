import type { IncomingHttpHeaders } from "node:http";

export interface RequestIdentity {
  authenticated: boolean;
  principalName: string;
  principalId?: string;
  provider?: string;
  source: "easy-auth" | "proxy-headers" | "local-dev";
}

interface EasyAuthPrincipal {
  auth_typ?: string;
  claims?: Array<{ typ?: string; val?: string }>;
  user_id?: string;
}

function parseEasyAuthPrincipal(encodedValue: string | undefined): EasyAuthPrincipal | undefined {
  if (!encodedValue) {
    return undefined;
  }

  try {
    const decoded = Buffer.from(encodedValue, "base64").toString("utf8");
    return JSON.parse(decoded) as EasyAuthPrincipal;
  } catch {
    return undefined;
  }
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function resolveRequestIdentity(
  headers: IncomingHttpHeaders,
  env: NodeJS.ProcessEnv = process.env,
): RequestIdentity {
  const principalHeader = parseEasyAuthPrincipal(firstHeaderValue(headers["x-ms-client-principal"]));
  const principalName =
    firstHeaderValue(headers["x-ms-client-principal-name"]) ??
    firstHeaderValue(headers["x-forwarded-preferred-username"]) ??
    principalHeader?.claims?.find((claim) =>
      [
        "preferred_username",
        "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
        "name",
      ].includes(claim.typ ?? ""),
    )?.val;

  if (principalName) {
    return {
      authenticated: true,
      principalName,
      principalId:
        firstHeaderValue(headers["x-ms-client-principal-id"]) ?? principalHeader?.user_id,
      provider:
        firstHeaderValue(headers["x-ms-client-principal-idp"]) ??
        principalHeader?.auth_typ ??
        "Microsoft Entra ID",
      source: firstHeaderValue(headers["x-ms-client-principal"])
        ? "easy-auth"
        : "proxy-headers",
    };
  }

  return {
    authenticated: env.NODE_ENV !== "production",
    principalName: env.LOCAL_OPERATOR_NAME ?? "local.operator@contoso.mil",
    provider: env.NODE_ENV !== "production" ? "Local development" : undefined,
    source: "local-dev",
  };
}
