@description('Location for all resources.')
param location string = resourceGroup().location

@description('Project tag value and resource name prefix.')
param projectName string = 'agc-auth-helper'

@allowed([
  'dev'
  'staging'
  'prod'
])
@description('Environment tag value.')
param environment string = 'dev'

@description('ManagedBy tag value.')
param managedBy string = 'bicep'

@description('Owner tag value.')
param owner string = 'platform-team'

@allowed([
  'CUI'
  'Secret'
  'TopSecret'
])
@description('Classification tag value.')
param classification string = 'CUI'

@allowed([
  'FedRAMP-High'
  'IL4'
  'IL5'
  'IL6'
])
@description('Compliance tag value.')
param compliance string = 'FedRAMP-High'

@description('Cloud profile name supplied to the web app.')
param cloudProfileName string = 'azure-us-government'

@description('Linux runtime stack for the App Service web app.')
param linuxFxVersion string = 'NODE|20-lts'

@description('Private DNS zone used for Blob private endpoints. Override this for Secret, Top Secret, or AzureStackCloud environments.')
param blobPrivateDnsZoneName string = 'privatelink.blob.core.usgovcloudapi.net'

@description('Private DNS zone used for Key Vault private endpoints. Override this for Secret, Top Secret, or AzureStackCloud environments.')
param keyVaultPrivateDnsZoneName string = 'privatelink.vaultcore.usgovcloudapi.net'

@description('Private DNS zone used for the web app private endpoint. Override this when the target sovereign environment uses a different internal App Service zone.')
param webPrivateDnsZoneName string = 'privatelink.azurewebsites.us'

var nameSuffix = uniqueString(resourceGroup().id, projectName, environment)
var shortSuffix = toLower(take(nameSuffix, 10))
var storageAccountName = toLower('st${take(uniqueString(projectName, environment, resourceGroup().id), 22)}')
var tags = {
  Environment: environment
  ManagedBy: managedBy
  Project: projectName
  Owner: owner
  Classification: classification
  Compliance: compliance
}

resource virtualNetwork 'Microsoft.Network/virtualNetworks@2023-11-01' = {
  name: 'vnet-${projectName}-${environment}'
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.42.0.0/16'
      ]
    }
    subnets: [
      {
        name: 'app'
        properties: {
          addressPrefix: '10.42.1.0/24'
          delegations: [
            {
              name: 'appServiceDelegation'
              properties: {
                serviceName: 'Microsoft.Web/serverFarms'
              }
            }
          ]
        }
      }
      {
        name: 'private-endpoints'
        properties: {
          addressPrefix: '10.42.2.0/24'
          privateEndpointNetworkPolicies: 'Disabled'
        }
      }
    ]
  }
}

var appSubnetId = '${virtualNetwork.id}/subnets/app'
var privateEndpointSubnetId = '${virtualNetwork.id}/subnets/private-endpoints'

resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-${projectName}-${environment}-${shortSuffix}'
  location: location
  tags: tags
  properties: {
    retentionInDays: 30
    sku: {
      name: 'PerGB2018'
    }
  }
}

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: 'asp-${projectName}-${environment}-${shortSuffix}'
  location: location
  tags: tags
  sku: {
    name: 'P1v3'
    tier: 'PremiumV3'
    size: 'P1v3'
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    publicNetworkAccess: 'Disabled'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: false
    encryption: {
      keySource: 'Microsoft.Storage'
      services: {
        blob: {
          enabled: true
        }
        file: {
          enabled: true
        }
      }
    }
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: 'Deny'
    }
  }
}

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: 'kv-${projectName}-${environment}-${shortSuffix}'
  location: location
  tags: tags
  properties: {
    tenantId: tenant().tenantId
    enableRbacAuthorization: true
    enabledForTemplateDeployment: false
    enablePurgeProtection: true
    softDeleteRetentionInDays: 90
    publicNetworkAccess: 'Disabled'
    sku: {
      family: 'A'
      name: 'standard'
    }
    networkAcls: {
      bypass: 'None'
      defaultAction: 'Deny'
    }
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: 'app-${projectName}-${environment}-${shortSuffix}'
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    publicNetworkAccess: 'Disabled'
    virtualNetworkSubnetId: appSubnetId
    siteConfig: {
      linuxFxVersion: linuxFxVersion
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      alwaysOn: true
      http20Enabled: true
      vnetRouteAllEnabled: true
      appSettings: [
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'AZURE_CLOUD'
          value: cloudProfileName
        }
        {
          name: 'AUTH_MODE'
          value: 'managedIdentity'
        }
        {
          name: 'AZURE_STORAGE_ACCOUNT'
          value: storageAccount.name
        }
      ]
    }
  }
}

resource blobPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: blobPrivateDnsZoneName
  location: 'global'
  tags: tags
}

resource keyVaultPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: keyVaultPrivateDnsZoneName
  location: 'global'
  tags: tags
}

resource webPrivateDnsZone 'Microsoft.Network/privateDnsZones@2020-06-01' = {
  name: webPrivateDnsZoneName
  location: 'global'
  tags: tags
}

resource resourceGroupReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, webApp.id, 'reader-role')
  scope: resourceGroup()
  properties: {
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', 'acdd72a7-3385-48ef-bd42-f606fba81ae7')
  }
}

resource storageBlobDataReaderRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(storageAccount.id, webApp.id, 'storage-blob-data-reader')
  scope: storageAccount
  properties: {
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1')
  }
}

resource keyVaultSecretsUserRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, webApp.id, 'key-vault-secrets-user')
  scope: keyVault
  properties: {
    principalId: webApp.identity.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6')
  }
}

resource blobDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: blobPrivateDnsZone
  name: 'blob-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource keyVaultDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: keyVaultPrivateDnsZone
  name: 'keyvault-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource webDnsLink 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2020-06-01' = {
  parent: webPrivateDnsZone
  name: 'web-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: virtualNetwork.id
    }
  }
}

resource webPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: 'pe-web-${shortSuffix}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'webapp-connection'
        properties: {
          privateLinkServiceId: webApp.id
          groupIds: [
            'sites'
          ]
        }
      }
    ]
  }
}

resource storagePrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: 'pe-storage-${shortSuffix}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'storage-blob-connection'
        properties: {
          privateLinkServiceId: storageAccount.id
          groupIds: [
            'blob'
          ]
        }
      }
    ]
  }
}

resource keyVaultPrivateEndpoint 'Microsoft.Network/privateEndpoints@2023-11-01' = {
  name: 'pe-kv-${shortSuffix}'
  location: location
  tags: tags
  properties: {
    subnet: {
      id: privateEndpointSubnetId
    }
    privateLinkServiceConnections: [
      {
        name: 'keyvault-connection'
        properties: {
          privateLinkServiceId: keyVault.id
          groupIds: [
            'vault'
          ]
        }
      }
    ]
  }
}

resource webDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: webPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'web-zone'
        properties: {
          privateDnsZoneId: webPrivateDnsZone.id
        }
      }
    ]
  }
}

resource blobDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: storagePrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'blob-zone'
        properties: {
          privateDnsZoneId: blobPrivateDnsZone.id
        }
      }
    ]
  }
}

resource keyVaultDnsZoneGroup 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2023-11-01' = {
  parent: keyVaultPrivateEndpoint
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'keyvault-zone'
        properties: {
          privateDnsZoneId: keyVaultPrivateDnsZone.id
        }
      }
    ]
  }
}

resource webAppDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'diag-webapp'
  scope: webApp
  properties: {
    workspaceId: logAnalyticsWorkspace.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource storageDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'diag-storage'
  scope: storageAccount
  properties: {
    workspaceId: logAnalyticsWorkspace.id
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

resource keyVaultDiagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: 'diag-keyvault'
  scope: keyVault
  properties: {
    workspaceId: logAnalyticsWorkspace.id
    logs: [
      {
        categoryGroup: 'audit'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

@description('The internal web app name.')
output webAppName string = webApp.name

@description('The storage account name used for the data-plane sample.')
output storageAccount string = storageAccount.name

@description('The Key Vault name reserved for application secrets and CMK integration.')
output keyVaultName string = keyVault.name
