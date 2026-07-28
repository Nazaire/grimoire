# Structure

How this grimoire is organized, and what the statuses mean.

## Layout

Two levels of nesting. Each `{domain}` is a folder at the root — a broad area
(`testing`, `git`, `architecture`…). Inside it, each `{topic}` is a theme worth
musing on (`errors`, `rebasing`, `mocking`…). `{artifact}` is a code file that
demonstrates the pattern — a source file, a worked example, or a snippet.

```
grimoire/
├── README.md                    # index → links to each {domain}
├── STRUCTURE.md                 # this file
├── DOMAIN_TEMPLATE.md           # starting point for a new {domain} README
├── TOPIC_TEMPLATE.md            # starting point for a new {topic} README
└── {domain}/
    ├── README.md                # index → links to each {topic} in this domain
    └── {topic}/
        ├── README.md            # the musing: what / why / status log
        └── {artifact}.{ext}
```

## The three README levels

- **`/README.md`** — the whole grimoire; an index linking out to each `{domain}`.
- **`/{domain}/README.md`** — the domain; an index linking out to each `{topic}`
  within it.
- **`/{domain}/{topic}/README.md`** — the actual entry: status, musing, and
  links to each `{artifact}` file with commentary.

Only the `{topic}` README carries a **status** and **status log**. The
`{artifact}` files are what it points at — kept around even when a topic is
retired, as a record of "here's what I used to do."

## Statuses

| Status | Meaning |
| --- | --- |
| ✅ **Active** | Still use it, still recommend it. |
| 🧪 **Trialing** | Testing whether it earns a spot. |
| ⚠️ **Situational** | Only in specific cases (noted in the entry). |
| 🪦 **Retired** | Don't use it anymore — with a reason and a date. |

The retired ones are half the point. A pattern I dropped, with the reason
attached, is worth more than one I never questioned. When my mind changes I
don't delete — I add a line to the **status log** and update the status. The
history is the value.

## Naming

Name `{artifact}` files by what they demonstrate, not generically, so a folder
listing reads like its own table of contents:

```
{domain}/
└── {topic}/
    ├── README.md
    └── {artifact}.{ext}
```
