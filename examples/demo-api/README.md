# Demo API

A zero-dependency Go server implementing the included **E-Commerce Platform
API** artifact. It provides a stable target for exercising Microcks dry-run
contract tests from the VS Code extension or CLI.

## Run

From the repository root:

```bash
npm run example:demo-api        # conforming responses: contract test passes
npm run example:demo-api:drift  # price is a string: contract test fails
```

The server listens on `http://localhost:3001` and implements:

- `GET /products`
- `GET /products/{productId}`

The equivalent direct Go commands are:

```bash
go -C examples/demo-api run .
go -C examples/demo-api run . -drift
go -C examples/demo-api run . -port 4000
```

## Test from VS Code

1. Start the conforming or drifted server.
2. Open `examples/demo-api/ecommerce-api-openapi.yml`.
3. Run **Microcks: Run Dry-Run for API File**.
4. Use service `E-Commerce Platform API:2.0.0`, endpoint
   `http://localhost:3001`, runner `OPEN_API_SCHEMA`, and operation
   `GET /products`.

The Tests tree records the run. Expand it to inspect operation and step-level
results.

## Test from the CLI

With a compatible Microcks CLI and Docker or Podman available:

```bash
microcks test --dry-run --output=github-actions \
  --artifact examples/demo-api/ecommerce-api-openapi.yml \
  --filteredOperations '["GET /products"]' \
  "E-Commerce Platform API:2.0.0" \
  http://localhost:3001 \
  OPEN_API_SCHEMA
```
