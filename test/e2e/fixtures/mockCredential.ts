import type { AccessToken, GetTokenOptions, TokenCredential } from "@azure/core-auth";

export class MockCredential implements TokenCredential {
  private token: string;
  private expiresOnTimestamp: number;

  constructor(token = "mock-access-token", expiresInMs = 3600_000) {
    this.token = token;
    this.expiresOnTimestamp = Date.now() + expiresInMs;
  }

  async getToken(_scopes: string | string[], _options?: GetTokenOptions): Promise<AccessToken> {
    return { token: this.token, expiresOnTimestamp: this.expiresOnTimestamp };
  }
}

export class FailingCredential implements TokenCredential {
  private errorMessage: string;

  constructor(errorMessage = "Token acquisition failed") {
    this.errorMessage = errorMessage;
  }

  async getToken(_scopes: string | string[], _options?: GetTokenOptions): Promise<AccessToken> {
    throw new Error(this.errorMessage);
  }
}
