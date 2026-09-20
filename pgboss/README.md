# PgBoss

Background work as classes: a **queue** you send to, a **worker** that
settles jobs with [`Result`](../typescript/result), an **event** other
queues subscribe to. The write that happened is the enqueue — same Prisma
transaction, same commit.

## Topics

| Topic | Status |
| --- | --- |
| [queues](./queues) | ✅ Active |
