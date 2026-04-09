## ADDED Requirements

### Requirement: Named cloud profiles define sovereign cloud metadata
The system SHALL load a named cloud profile from configuration. Each profile MUST explicitly define the authority host, Azure Resource Manager endpoint, Azure Resource Manager audience or scope root, and the service endpoint suffixes required by the reference application.

#### Scenario: Startup loads a sovereign cloud profile
- **WHEN** the application starts with a configured profile such as `azure-us-gov-secret`
- **THEN** it resolves the authority host, ARM endpoint, ARM audience, and service suffixes from that profile before creating any Azure clients

### Requirement: Cloud profile validation fails closed
The system SHALL validate the selected cloud profile during startup and MUST block execution when required endpoints or audiences are missing, malformed, or contradictory.

#### Scenario: Required management audience is missing
- **WHEN** the selected cloud profile omits the ARM audience value
- **THEN** the application fails startup with an actionable validation error that identifies the missing field

### Requirement: Credential construction honors custom authorities
The system SHALL construct `azure-identity` credentials with the authority host defined by the active cloud profile and SHALL prefer managed identity or workload identity for deployed environments over secret-based credentials.

#### Scenario: Deployed workload uses managed identity in a custom cloud
- **WHEN** the reference app runs in Azure with a managed identity and a non-public cloud profile
- **THEN** it acquires tokens through `azure-identity` using the configured authority host without requiring an application secret

### Requirement: Token audiences remain explicit configuration
The system SHALL request access tokens using explicit audience or scope values from the selected cloud profile and MUST NOT derive those values only from the management endpoint hostname.

#### Scenario: Audience differs from the management endpoint
- **WHEN** a cloud uses a token audience that is different from its management endpoint URL
- **THEN** the application requests the token for the configured audience while still sending requests to the configured management endpoint
