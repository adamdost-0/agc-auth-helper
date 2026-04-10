---
title: Home
layout: home
nav_order: 1
---

# Sovereign Auth Guide

**Code patterns for making `@azure/identity` work with Azure Stack Hub, Azure Government Secret, and Azure Government Top Secret.**

This guide shows the specific code changes needed to authenticate with the Azure SDKs in private cloud environments — where Microsoft's public instance discovery endpoints are unreachable and custom authority hosts, ARM endpoints, and token audiences must be configured explicitly.

---

## Who this is for

- Engineers building apps for **Azure Government Secret (IL6)** or **Top Secret (TS/SCI)** enclaves
- Teams deploying to **Azure Stack Hub** with custom authority hosts and ARM endpoints
- Anyone working with **custom Azure clouds** where `login.microsoftonline.com` is not accessible

## The core problem

The `@azure/identity` SDK validates authority hosts against Microsoft's public instance discovery endpoint by default. In air-gapped or private clouds, this validation fails because:

1. The authority host (e.g., `login.mystack.contoso.local`) is **not registered** with Microsoft's public directory
2. The network **cannot reach** `login.microsoft.com` to perform the validation
3. The ARM audience and service endpoints **differ** from public cloud defaults

## The solution

Set `disableInstanceDiscovery: true` on credential constructors and provide explicit cloud configuration — authority hosts, ARM endpoints, token audiences, and service DNS suffixes — through a **cloud profile** that encapsulates all environment-specific values.

This reference app demonstrates the complete pattern with a working implementation.

## What you'll find here

| Guide | Description |
|-------|-------------|
| [Getting Started](getting-started) | Clone, configure, and run the reference app |
| [Cloud Profiles](cloud-profiles) | The cloud profile model — endpoints, audiences, DNS suffixes |
| [Authentication](authentication) | `disableInstanceDiscovery`, credential types, ARM metadata discovery |
| [Code Snippets](code-snippets) | Copy-paste code for `azure-identity` in TypeScript, Python, .NET, Go, and CLI |
| [Deployment](deployment) | Bicep infrastructure with private endpoints and managed identity |

## Quick start

```bash
git clone https://github.com/adamdost-0/agc-auth-helper.git
cd agc-auth-helper
npm install
cp .env.example .env
# Edit .env with your cloud and auth settings
npm run dev
```

## Supported clouds

| Cloud | Environment | Authority Host | Status |
|-------|------------|----------------|--------|
| Azure Commercial | `public` | `login.microsoftonline.com` | ✅ Built-in |
| Azure Government | `usgovernment` | `login.microsoftonline.us` | ✅ Built-in |
| Azure Gov Secret | `usgovernmentsecret` | Enclave-specific | ✅ Built-in (placeholder) |
| Azure Gov Top Secret | `usgovernmenttopsecret` | Enclave-specific | ✅ Built-in (placeholder) |
| Azure Stack Hub | `azurestackcloud` | On-premises | ✅ Built-in (placeholder) |
| Custom Cloud | `custom` | User-provided | ✅ Via JSON profile |
