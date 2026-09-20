# Analytics

A fact on the write becomes an event. The handler stamps context; the service
publishes `analytics.event` on the same tx; a subscriber delivers. The
service does not talk to PostHog.

## Topics

| Topic              | Status    |
| ------------------ | --------- |
| [events](./events) | ✅ Active |
