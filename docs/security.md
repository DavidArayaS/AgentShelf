# Security model

All remote URLs are hostile. The native crawler accepts credential-free HTTP(S) standard ports only, rejects private/reserved/loopback addresses and local hostnames, resolves all DNS answers, rejects mixed public/private answers, and pins a vetted address into the socket lookup. TLS verification uses the original hostname and remains enabled. Redirect destinations repeat the full checks; cycles and redirect counts are bounded.

Each client serializes requests, enforces a minimum start interval, and bounds the total active request deadline and response bytes. It requests identity encoding and rejects compressed responses rather than expanding untrusted payloads. Strict UTF-8 decoding rejects malformed byte sequences. JSON has byte/depth limits and rejects prototype-related keys and unpaired surrogates. Never evaluate downloaded JavaScript.

Application fixtures must inject an explicit in-memory HttpClient; no production option disables private-address protections. Native transport does not yet implement an outbound HTTP proxy. Do not claim proxy-only environment compatibility or complete crawler hardening until transport and integration tests verify it.

Local secret checks use maintained Secretlint core rules for private keys, AWS, GitHub, npm and OpenAI credentials, reporting only rule IDs and locations. They scan tracked and unignored working-tree files. This does not replace repository-host secret scanning or a release history audit. No credential values, catalog records or scan URLs are sent to AgentShelf servers.
