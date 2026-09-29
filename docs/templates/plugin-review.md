# Plugin Review Checklist

- [ ] Manifest declares version, permissions, resources, and data classes.
- [ ] No undeclared network or filesystem access.
- [ ] Tenant and scope checks cannot be bypassed.
- [ ] Secrets are not exposed to model, browser, logs, or plugin output.
- [ ] Read/write classification is accurate.
- [ ] Input/output schemas are bounded.
- [ ] Timeout, cancellation, and retry behavior is safe.
- [ ] Audit events are emitted.
- [ ] Deletion and revocation behavior is documented.
- [ ] Adversarial and cross-tenant tests pass.
- [ ] Support owner and rollback version are defined.
- [ ] Manual approval completed before production enablement.
