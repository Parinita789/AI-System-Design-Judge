# Code review rubric

When reviewing each file, evaluate against the axes below. Tag every
issue with its axis. Be honest about severity; inflated severities
are worse than missed issues.

## Axes

- **correctness** — does the code do what it claims under all
  reachable inputs? Boundary cases, off-by-ones, wrong control flow,
  silently-wrong behavior.
- **error-handling** — exceptions, retries, timeouts, partial
  failure, idempotency, swallowed errors, missing rollback.
- **boundary-safety** — auth, authz, input validation, SQL/NoSQL
  injection, SSRF, race conditions, leaked secrets, untrusted data
  reaching trusted code paths.
- **observability** — log context, error chaining, structured fields,
  metric coverage, debuggability of failure modes.
- **testability** — is the code shaped so the meaningful behaviors
  can be exercised in isolation? Hidden state, untestable seams,
  hard-coded dependencies.
- **api-shape** — for HTTP/CLI surfaces: parameter shape, status
  codes, idempotent verbs, contract clarity, response shape.
- **naming-readability** — only when it actively impedes one of the
  above. Plain unclear names alone are usually nits.

## Severity vocabulary

- **critical** — data loss, auth bypass, crash on first prod input,
  unrecoverable corruption.
- **high** — silent corruption, easily-hit edge case, P0 incident
  shape, regression risk in core flows.
- **medium** — latent bug, missed invariant, hard-to-test code,
  meaningful debt that will hurt later.
- **low** — minor footgun, missing log context, narrowly-scoped
  smell.
- **nit** — name/comment/ordering. Suppress nits unless they
  cluster or obscure a real issue.

## Output rules

- Cite issues by 1-indexed line numbers that actually exist in the
  supplied source.
- Use the exact axis names above; reject any axis not listed.
- The `fingerprint` field on each issue must be a one-line canonical
  description (≤80 chars) that you would phrase identically if you
  saw the same defect again in a future run. This is what we hash
  to track issue lifecycle across runs.
- If you cannot find substantive concerns, return empty arrays. Do
  not invent issues to fill space.
