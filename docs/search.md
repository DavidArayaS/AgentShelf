# Search for agents

Search is a first-class Open Core capability over any canonical catalog. It does not import a crawler, connector, WooCommerce, ACP or UCP. Private data can be imported, searched and served entirely without website access.

From a checkout, build and run:

```bash
pnpm build
node apps/cli/dist/index.js import examples/sample-catalog/catalog.json --output=catalog.json
node apps/cli/dist/index.js search catalog.json 'running shoe under $150'
node apps/cli/dist/index.js search catalog.json 'waterproof shoe' --max-price 150 --currency USD --availability in_stock --attributes '{"waterproof":true}'
node apps/cli/dist/index.js serve catalog.json
```

These commands correspond to `agentshelf import/search/serve` after actual package installation. Single-quote shell queries containing `$` to avoid shell variable expansion. `import` validates and analyzes a file; `--output` writes normalized JSON to a new file without overwriting. It does not upload or synchronize anything. Omitting `--output` prints a report and leaves the source file usable by search/serve.

The CLI supports min/max price, currency, availability, brand, category, merchant, JSON product attributes, JSON variant properties, shipping destination, sort, offset and limit. It emits structured JSON results; `--json` also makes errors machine-readable. Catalog files are bounded to 32 MiB. The web/API import limit is 1 MiB; use CLI/package APIs for the generated 10k fixture.

A small deterministic English grammar handles `under/below $200` and `over/above $100` (inclusive bounds, USD by default), `size 10` (variant size) and `in stock`. Without `$`, numeric price phrases require an explicit currency; otherwise they remain lexical text. Explicit structured filters win over inferred values. General conversational interpretation, unit conversion, currency conversion, stemming, synonyms and shipping inference are not promised. Use structured filters for precise agent requests.

REST example after serving:

```text
GET /v1/products/search?query=wireless%20headphones&maxPrice=200&currency=USD&availability=in_stock
```

MCP calls the same QueryEngine:

```json
{
  "name": "search_products",
  "arguments": {
    "query": "wireless headphones",
    "maxPrice": 200,
    "currency": "USD",
    "availability": "in_stock"
  }
}
```

Results carry canonical products with product/merchant identities, original offers, attributes, variants, provenance and source links plus total/offset/limit. A matching product can contain additional nonmatching offers or variants: consumers should evaluate the matching offer, not assume every returned offer satisfies filters. Inventory quantities are observations, not reservations; missing quantities stay unknown. Deterministic relevance is a lexical ordering aid, not a probability or a prediction of another agent's ranking. Missing facts are never filled with model guesses.

Generate realistic private test data using `pnpm fixture:generate` (defaults to 10,000 seeded products at `reports/private-catalog.json`). Integration tests assert nonempty candidates, price/availability/brand/attribute/variant constraints, stable ordering and equivalent results through engine/REST/official MCP client, including a real import/search/serve subprocess flow. [Query implementation](query-engine.md) · [Performance](performance.md).
