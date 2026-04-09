export function renderHomePage(input: {
  defaultCloud: string;
  subscriptionId?: string;
  storageAccountName?: string;
  authMode: string;
  clouds: Array<{ name: string; displayName: string; notes?: string }>;
}): string {
  const bootstrapJson = JSON.stringify(input).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sovereign Auth Reference</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: Inter, "Segoe UI", sans-serif;
      }
      body {
        margin: 0;
        background: #09111f;
        color: #e5eefc;
      }
      main {
        max-width: 1100px;
        margin: 0 auto;
        padding: 2rem 1.25rem 3rem;
      }
      .hero {
        padding: 1.25rem 1.5rem;
        border-radius: 16px;
        background: linear-gradient(135deg, #0f1b34, #12284c);
        border: 1px solid #29436f;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1rem;
        margin-top: 1rem;
      }
      .card,
      .panel {
        background: #0d1729;
        border: 1px solid #243a5a;
        border-radius: 14px;
        padding: 1rem;
      }
      .panel {
        margin-top: 1rem;
      }
      label {
        display: block;
        margin-bottom: 0.35rem;
        font-size: 0.9rem;
      }
      input,
      select,
      button {
        width: 100%;
        box-sizing: border-box;
        padding: 0.7rem 0.8rem;
        border-radius: 10px;
        border: 1px solid #3c5e8f;
        background: #0e1d33;
        color: inherit;
      }
      button {
        cursor: pointer;
        font-weight: 600;
        background: #175cd3;
      }
      .actions {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 0.75rem;
        margin-top: 0.75rem;
      }
      pre {
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        background: #08101d;
        border-radius: 12px;
        padding: 1rem;
        border: 1px solid #20314f;
        min-height: 220px;
      }
      .muted {
        color: #a8bddf;
      }
      code {
        font-family: "SFMono-Regular", ui-monospace, monospace;
      }
    </style>
  </head>
  <body>
    <main>
      <section class="hero">
        <h1>Sovereign Auth Reference Web App</h1>
        <p class="muted">
          A backend-for-frontend sample that keeps custom Azure cloud endpoints, token audiences,
          and <code>azure-identity</code> credentials server-side.
        </p>
        <div class="grid">
          <div class="card">
            <strong>Default cloud</strong>
            <div id="default-cloud"></div>
          </div>
          <div class="card">
            <strong>Auth mode</strong>
            <div id="auth-mode"></div>
          </div>
          <div class="card">
            <strong>Signed-in identity</strong>
            <div id="identity-summary">Loading…</div>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2>Cloud-aware diagnostics</h2>
        <div class="grid">
          <div>
            <label for="cloud-select">Cloud profile</label>
            <select id="cloud-select"></select>
          </div>
          <div>
            <label for="subscription-id">Subscription ID</label>
            <input id="subscription-id" placeholder="00000000-0000-0000-0000-000000000000" />
          </div>
          <div>
            <label for="storage-account">Storage account</label>
            <input id="storage-account" placeholder="mystorageacct" />
          </div>
        </div>

        <div class="actions">
          <button id="profile-button" type="button">Show profile</button>
          <button id="diagnostics-button" type="button">Run diagnostics</button>
          <button id="subscriptions-button" type="button">List subscriptions</button>
          <button id="resource-groups-button" type="button">List resource groups</button>
          <button id="containers-button" type="button">List blob containers</button>
        </div>

        <p class="muted">
          The browser calls only this local backend. Azure control-plane and data-plane requests are
          made by the server with the active cloud profile and explicit audience values.
        </p>

        <pre id="output">Ready.</pre>
      </section>
    </main>

    <script id="bootstrap-data" type="application/json">${bootstrapJson}</script>
    <script>
      const bootstrap = JSON.parse(document.getElementById("bootstrap-data").textContent ?? "{}");
      const output = document.getElementById("output");
      const cloudSelect = document.getElementById("cloud-select");
      const subscriptionInput = document.getElementById("subscription-id");
      const storageInput = document.getElementById("storage-account");

      document.getElementById("default-cloud").textContent = bootstrap.defaultCloud;
      document.getElementById("auth-mode").textContent = bootstrap.authMode;
      subscriptionInput.value = bootstrap.subscriptionId ?? "";
      storageInput.value = bootstrap.storageAccountName ?? "";

      for (const cloud of bootstrap.clouds) {
        const option = document.createElement("option");
        option.value = cloud.name;
        option.textContent = \`\${cloud.displayName} (\${cloud.name})\`;
        option.selected = cloud.name === bootstrap.defaultCloud;
        cloudSelect.appendChild(option);
      }

      async function fetchJson(path) {
        const response = await fetch(path);
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error ?? response.statusText);
        }

        return payload;
      }

      function selectedCloud() {
        return cloudSelect.value;
      }

      function updateOutput(title, payload) {
        output.textContent = \`\${title}\\n\\n\${JSON.stringify(payload, null, 2)}\`;
      }

      async function run(label, path) {
        output.textContent = \`\${label}...\\n\`;

        try {
          const payload = await fetchJson(path);
          updateOutput(label, payload);
        } catch (error) {
          updateOutput(\`\${label} failed\`, { error: error.message });
        }
      }

      async function loadIdentity() {
        try {
          const identity = await fetchJson("/api/whoami");
          document.getElementById("identity-summary").textContent = identity.authenticated
            ? \`\${identity.principalName} via \${identity.provider ?? identity.source}\`
            : "anonymous";
        } catch (error) {
          document.getElementById("identity-summary").textContent = error.message;
        }
      }

      document.getElementById("profile-button").addEventListener("click", () => {
        run("Cloud profile", \`/api/profile?cloud=\${encodeURIComponent(selectedCloud())}\`);
      });

      document.getElementById("diagnostics-button").addEventListener("click", () => {
        run(
          "Diagnostics",
          \`/api/diagnostics?cloud=\${encodeURIComponent(selectedCloud())}&probe=true\`,
        );
      });

      document.getElementById("subscriptions-button").addEventListener("click", () => {
        run(
          "Subscriptions",
          \`/api/subscriptions?cloud=\${encodeURIComponent(selectedCloud())}\`,
        );
      });

      document.getElementById("resource-groups-button").addEventListener("click", () => {
        const subscriptionId = subscriptionInput.value.trim();
        run(
          "Resource groups",
          \`/api/resource-groups?cloud=\${encodeURIComponent(selectedCloud())}&subscriptionId=\${encodeURIComponent(subscriptionId)}\`,
        );
      });

      document.getElementById("containers-button").addEventListener("click", () => {
        const storageAccount = storageInput.value.trim();
        run(
          "Blob containers",
          \`/api/blob-containers?cloud=\${encodeURIComponent(selectedCloud())}&storageAccount=\${encodeURIComponent(storageAccount)}\`,
        );
      });

      loadIdentity();
    </script>
  </body>
</html>`;
}
