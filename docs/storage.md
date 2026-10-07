# Storage

Storage is an injected implementation detail. Core depends on the `CatalogRepository` and `ScanRepository` ports, not a database. The memory adapter suits demos and short-lived processes. The SQLite adapter persists validated catalog and scan JSON for local use and uses Node's built-in SQLite API; it does not open a network listener or synchronize data to a service.

Applications select an adapter when constructing the API, CLI, or scan workflow. Repository reads return canonical schema values and writes validate before persistence. Keep SQL, file paths, and driver types out of `@agentshelf/schema`, connector contracts, and query interfaces. This boundary lets a private Cloud consumer provide its own repository without forking Open Core.

Local persistence is not encrypted storage. Do not put credentials or private customer records in catalogs. Hosted synchronization, tenant isolation, and managed backup are outside this repository.
