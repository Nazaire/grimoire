# oRPC

The HTTP edge. A procedure is a published contract: audience tree, Zod DTO,
status and body. Services return [`Result`](../typescript/result); the
handler maps a [`CodedError`](../typescript/coded-error) to `errors.NOT_FOUND({
cause })`. The [logger](../observability/logger) is the interceptor, not the
route.

## Topics

| Topic        | Status    |
| ------------ | --------- |
| [rpc](./rpc) | ✅ Active |
