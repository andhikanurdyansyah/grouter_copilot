# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users are developers building Node.js applications who want to expose selected application data through explicitly defined, read-only skills and add an embedded AI copilot. Customer account holders purchase and manage licenses through the Copilot web portal.

## Product Purpose

gRouter Copilot is a licensed npm plugin/runtime and its companion license, payment, and account portal. Success means a developer can install the package in a Node.js application, connect a valid license, define approved data skills, and provide an in-app chat experience without exposing credentials in the browser.

## Positioning

The product's distinctive mechanism is developer-defined skill access: the application explicitly decides which data the assistant can read. gRouter is an external AI supplier consumed read-only; it is not the Copilot product or a codebase to modify.

## Operating Context

Customer journey: discover the product, create an account, purchase a plan through the portal, receive a license, follow framework-specific installation guidance, configure approved skills, and use the embedded chat in the host application. The portal uses one public origin; its frontend proxies API requests to the private backend.

## Capabilities and Constraints

- Node.js/npm plugin with runtime chat, skill registry and validator, gRouter adapter, Ed25519 license validation, and a React chat panel exist in the repository.
- Copilot backend provides account and license management, payment, license resolution, and dashboards. Current handoff says the product is still development-stage and KlikQRIS is sandbox.
- Customer credential policy for the planned experience: the customer enters a Copilot license only, never a gRouter API key. D-015 and current PO direction take precedence over older README/product docs that describe customer-managed provider keys.
- Admin currently binds existing gRouter keys manually; automatic provisioning is deferred. Do not promise immediate self-service activation until the operational dependency is resolved and tested.
- The installer command and generated integration, draggable launcher, configurable welcome message, and first-use setup are not yet verified as a complete customer flow. Treat them as planned until proven.
- Product scope is Node.js first; do not imply universal framework support without evidence.

## Brand Commitments

Product name: gRouter Copilot. The PO selected a full visual redesign of the marketing surface, pinned to the Notion style reference in `DESIGN.md` (warm paper canvas, hairline cards, single blue accent, flat accent panels); the earlier Infobip-inspired cyan direction and the dark cyberpunk grx theme are retired for the landing only. Dashboards keep the grx-v3 dark theme.

## Evidence on Hand

Repository evidence includes `src/runtime/chat.js`, `src/skills/registry.js`, `src/license/gate.js`, `src/widget/CopilotChat.jsx`, `bin/grouter-copilot.js`, backend license/payment services, and customer-facing portal pages. The existing widget is a chat panel, not the requested draggable bubble and first-run setup. There are no verified customer testimonials, case studies, production readiness claims, or completed end-to-end install results available for marketing use.

## Product Principles

- Customer data access is explicitly defined by the application developer.
- Default skills are read-only.
- Customer-facing setup uses the Copilot license, never a gRouter API key.
- Keep credentials out of browser code and license-token payloads.
- State verified capability separately from planned capability.
