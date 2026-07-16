# File Properties use front matter as the source of truth

> **Target-product qualification (2026-07-11):** This remains the current
> serialization contract, including preserving properties in projected Markdown. Its
> claim that a local file is the sole authority across every desktop mode does not
> apply to the planned cloud-workspace model in
> `/specs/desktop-cloud-workspace/PRODUCT.md`, where the cloud document is authoritative
> and Markdown is a writable projection. Revisit this ADR during that implementation.

File Properties are stored in each Markdown File's YAML front matter, and the full markdown file remains the only source of truth across web, desktop, Workspace Folders, Plain Folders, and Loose Files. The shared editor layer parses front matter separately from the markdown body, edits supported properties through rich controls, preserves unsupported or invalid front matter, and recombines front matter with the body on save.

## Consequences

- No separate metadata table or app-specific property store exists for v1.
- Parsing uses YAML 1.2-compatible behavior so `true` and `false` become checkboxes, while ambiguous words like `yes`, `no`, `on`, and `off` remain text.
- Date properties are recognized only from explicit `YYYY-MM-DD` values to avoid timezone and parser coercion surprises.
- Unsupported property values are preserved and shown as raw YAML for that property; invalid whole front matter is preserved and shown as unavailable until it parses again.
- User-selected property type overrides live only in memory for the current session, keyed by file and property.
