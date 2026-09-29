# UX and Design Principles

## Product experience

Copilot should feel native to the host application, not like a foreign support widget. The host app owns identity and navigation; Copilot owns conversation, source explanation, and AI state.

## Surfaces

1. Embedded launcher and panel.
2. Full-page assistant.
3. Headless API for custom UI.
4. Admin control plane.
5. Source and freshness detail.
6. Skill-specific result cards.

## Answer states

- loading/retrieving;
- answer streaming;
- complete;
- partial data;
- stale data;
- blocked by permission;
- connector unavailable;
- model unavailable;
- cancelled;
- feedback submitted.

Never show an empty response for a blocked or failed run.

## Trust UX

Every non-trivial answer should make clear:

- what data period was used;
- which source categories were consulted;
- whether results were partial or sampled;
- when the source was last updated;
- what Copilot could not access;
- whether a recommendation is descriptive or prescriptive.

## Admin UX

Configuration must follow a progressive flow:

1. Connect application.
2. Validate identity.
3. Choose resources.
4. Define scope.
5. Enable a skill.
6. Test with fixture or permitted data.
7. Publish to environment.

Do not show “connected” merely because credentials are non-empty; show verified connectivity only after a real bounded probe.

## Accessibility and localization

- keyboard navigation;
- screen-reader labels;
- reduced motion;
- adequate contrast;
- responsive embedded panel;
- locale-aware dates and numbers;
- safe rendering of markdown/HTML;
- right-to-left readiness in protocol.

## UX non-goals

Do not force every application to use the same visual design. Do not hide uncertainty to make responses look confident. Do not replace application navigation with an opaque AI-only interface.
