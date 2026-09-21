# API

The HTTP edge. Always oRPC. A procedure is a published contract on an
audience tree ([rpc](./rpc)). The wire type is a DTO in `*-schemas.ts`
([schemas](./schemas)) — parse at the edge; services never see it. The
[logger](../observability/logger) is the interceptor, not the route.
Committed OpenAPI snapshots plus oasdiff fail a PR that breaks the
wire ([openapi](./openapi)).

## Topics

| Topic                | Status    |
| -------------------- | --------- |
| [rpc](./rpc)         | ✅ Active |
| [schemas](./schemas) | ✅ Active |
| [openapi](./openapi) | ✅ Active |
