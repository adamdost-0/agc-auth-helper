## ADDED Requirements

### Requirement: The reference app uses private internal ingress
The reference web app SHALL be deployable with internal-only ingress and private connectivity to its dependent Azure services. Public network access MUST be disabled for the secret stores and data services used by the sample.

#### Scenario: Private deployment baseline
- **WHEN** the sample is deployed to a sovereign or AzureStackCloud environment
- **THEN** users access it through approved private network paths and the dependent services expose no public endpoints

### Requirement: The backend mediates Azure resource access
The reference architecture SHALL use a backend-for-frontend or API layer to call Azure Resource Manager and other Azure services so that cloud-specific audiences and credentials remain server-side.

#### Scenario: User requests an Azure operation
- **WHEN** an authenticated user triggers a management or data-plane action from the UI
- **THEN** the backend acquires the required token via `azure-identity` and performs the call without exposing downstream resource audiences to the browser

### Requirement: Service clients are built from cloud metadata
The system SHALL construct ARM, Key Vault, Storage, and other Azure service clients from the selected cloud profile so the same application code path can run against Azure Government, Azure Government Secret or Top Secret, or AzureStackCloud.

#### Scenario: Cloud changes without code changes
- **WHEN** an operator switches the configured cloud profile from `azure-us-government` to `azurestack-custom`
- **THEN** the application uses the new endpoints and audiences without application code modifications

### Requirement: The reference app exposes operational diagnostics
The reference app SHALL expose a health or diagnostics view that reports the selected cloud profile, reachable control-plane endpoint, and credential mode without revealing secrets or access tokens.

#### Scenario: Operator verifies environment wiring
- **WHEN** an operator opens the diagnostics view or health endpoint
- **THEN** they can confirm which cloud profile is active and whether identity bootstrap succeeded
