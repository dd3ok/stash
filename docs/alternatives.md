# Related projects and scope

Reviewed on 2026-07-29. This is a scope comparison, not a quality ranking.

| Project | Primary job | Important difference from Stash |
|---|---|---|
| [Microsoft Agent Framework skills provider](https://github.com/MicrosoftDocs/semantic-kernel-docs/blob/main/agent-framework/agents/skills.md) | Discover, load, read, and optionally execute skills inside Microsoft Agent Framework | Framework integration rather than an explicit cross-vendor entry point for a separate local library; script execution is an optional provider capability |
| [Block Agent Skills](https://github.com/block/agent-skills) | Curated public skill collection and marketplace | Catalog content and installation, not private local catalog routing |
| [agent-skills-cli](https://github.com/Karanjot786/agent-skills-cli) | Search, install, update, remove, compose, and synchronize skills across many agents | Broader lifecycle manager with remote sources; Stash intentionally has no install or mutation path |
| [Tech Leads Club Agent Skills](https://github.com/tech-leads-club/agent-skills) | Remote registry plus MCP search/read tools | Closest search-first/read-later shape, but backed by a remote CDN/MCP service rather than read-only local catalogs |
| [agentskill.sh / ags](https://github.com/agentskill-sh/ags) | Remote marketplace discovery, security scoring, installation, updates, and feedback | Stronger marketplace lifecycle and reputation features; materially larger trust and network surface |
| [Cloudflare Agent Skills Discovery RFC](https://github.com/cloudflare/agent-skills-discovery-rfc) | Proposed `.well-known` discovery and archive distribution contract | Useful future remote-catalog direction, but Stash v0.1 stays local and does not claim this proposal as a standard |

## Decision

Reuse another project when the goal is marketplace discovery, installation,
updates, reputation, or a framework-native provider. Use Stash when the desired
boundary is narrower:

- keep an existing local catalog inactive;
- expose one explicitly named router;
- resolve exact names deterministically;
- return every materially relevant result without a fixed total cap;
- read only the selected skill and requested resources;
- avoid network access, telemetry, execution, and catalog mutation.

The projects above validate the search-first/progressive-disclosure direction.
They do not replace the explicit-only policy adapters or the local read-only
boundary required here.
