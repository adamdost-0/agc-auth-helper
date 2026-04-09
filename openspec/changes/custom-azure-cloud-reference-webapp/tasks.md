## 1. Cloud profile foundation

- [x] 1.1 Define the cloud profile schema and sample profiles for Azure Government, Azure Government Secret/Top Secret, and AzureStackCloud-style environments.
- [x] 1.2 Implement startup validation for authority hosts, management endpoints, audience URLs, and service suffix configuration.

## 2. Identity and client construction

- [x] 2.1 Build a deterministic `azure-identity` credential factory that prefers managed identity or workload identity in deployed environments and supports explicit local development auth.
- [x] 2.2 Add cloud-aware builders for ARM and data-plane clients that consume explicit endpoints and token audiences from the selected cloud profile.

## 3. Reference web app implementation

- [x] 3.1 Scaffold the private web UI and backend-for-frontend API flow for sign-in, diagnostics, and sample Azure operations.
- [x] 3.2 Add sample integrations for at least one control-plane operation and one data-plane service while keeping downstream tokens and resource audiences server-side.

## 4. Deployment and validation

- [x] 4.1 Author deployment assets for private ingress, managed identity, private endpoints, and internal DNS assumptions in sovereign environments.
- [x] 4.2 Document and automate a smoke-test matrix that verifies cloud profile selection and token acquisition across supported custom Azure clouds.
