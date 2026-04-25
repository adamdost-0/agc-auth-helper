---
title: Air-Gap Flow Impact
layout: default
nav_order: 4.5
---

# Air-Gap Flow Impact

This page explains how the required air-gap settings change the Azure SDK authentication flow.

## 1. Normal public Azure

![Public Azure default flow](assets/airgap-public-flow.svg)

The default Azure SDK path works because the app can reach public Microsoft discovery, public sign-in, and public Azure service endpoints.

## 2. Air-gapped cloud without the changes

![Air-gapped flow without required changes](assets/airgap-broken-flow.svg)

The app is inside the private network, but the SDK still tries to call a public discovery service and use public Azure endpoints. Those calls are unreachable, so token acquisition fails before ARM or Storage calls can work.

## 3. Air-gapped cloud with the required changes

![Air-gapped flow after required changes](assets/airgap-fixed-flow.svg)

The app now uses a cloud profile containing the private authority host, management endpoint, token audiences, and service DNS suffixes. For custom/private authorities, the credential factory also skips public instance discovery.

## What each required change does

| Required setting | Required customization | Flow impact |
|------------------|-------------|-------------|
| `authorityHost` | Provide the private/cloud-specific identity endpoint. | Credentials ask the intended authority instead of a public login host. |
| `disableInstanceDiscovery: true` | Skip public instance discovery for non-public authorities. | MSAL avoids the public discovery call that air-gapped networks cannot reach. |
| `resourceManagerEndpoint` | Provide the private/cloud-specific ARM endpoint. | ARM URLs are built for Azure Stack Hub, Secret, Top Secret, or the custom cloud. |
| `resourceManagerAudience` and `serviceAudiences` | Provide the token audiences expected by the target cloud. | Tokens are scoped to the private ARM, Storage, or Key Vault audience instead of public Azure defaults. |
| `serviceDnsSuffixes` | Provide the DNS suffixes used by the target cloud. | Storage, Key Vault, SQL, and registry hostnames are built with the private cloud suffixes. |
| `AUTH_MODE` | Select the credential type appropriate for the runtime. | Local dev can use Azure CLI or device code; deployed workloads should use managed identity or workload identity when available. |

## The short version

For air-gapped Azure environments, the SDK cannot rely on public Azure defaults. Provide explicit cloud configuration through a cloud profile, then keep token acquisition and Azure service calls on the server side.
