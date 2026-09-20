# CalDAV Bridge

Send calendar events from your notes to any CalDAV server — Infomaniak, Nextcloud, iCloud, Fastmail, Radicale — and update or delete them later.

The plugin has no calendar view of its own. It is a bridge: it exposes a small API that your [QuickAdd](https://github.com/chhoumann/quickadd) or [Templater](https://github.com/SilentVoid13/Templater) scripts can call to create an event and get back a UID, so the note and the calendar entry stay connected. It also ships two dialogs your scripts can reuse to collect the data.

It uses Obsidian's own `requestUrl`, so it works on desktop and on mobile, with no CORS problems.

## Features

- Create, update, read and delete events on a CalDAV collection.
- Timed events and all-day events.
- Reminders: relative for timed events (15 minutes before), absolute for all-day events (09:00 that day).
- `SEQUENCE` support, so updates are accepted by clients that already synced the event.
- Two reusable dialogs: a task dialog and a generic form builder.
- A ribbon icon that runs any command you name — handy for launching a QuickAdd macro.
- Interface in English or Spanish.

## Installation

### From the community plugins directory

Settings → Community plugins → Browse → search for "CalDAV Bridge" → Install → Enable.

### Manually

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](../../releases/latest).
2. Put them in `<your vault>/.obsidian/plugins/caldav-bridge/`.
3. Reload Obsidian and enable the plugin in Settings → Community plugins.

## Setup

In the plugin settings:

| Setting | What it is |
| --- | --- |
| Calendar URL | Full address of the calendar collection, ending in a slash |
| Username | The account's username |
| Password | An application password from your provider |
| Default reminder | Minutes before the event; 0 for none |
| Language | Automatic, English or Spanish |

The URL has to point at the calendar collection itself, not at the account root. It usually looks like this:

```
https://server/calendars/<user>/<calendar-id>/
```

Press **Test connection** in the settings to check the address and the credentials before creating anything.

### Where the password is stored

The plugin keeps its settings — the password included — as plain text in `.obsidian/plugins/caldav-bridge/data.json`, inside your vault. That is how Obsidian stores plugin settings, and it means the password travels with your vault if you sync it. Use an application password issued by your provider rather than your main account password, and revoke it from the provider if you ever share the vault.

## Commands

| Command | What it does |
| --- | --- |
| Test server connection | Checks URL and credentials |
| Create test event (tomorrow at 10:00) | Writes a real event to your calendar so you can see it arrive |
| Open task dialog (demo) | Shows the task dialog without writing anything |
| Run linked command | Runs the command named in the settings (the ribbon icon does the same) |

## API for scripts

```js
const cb = app.plugins.plugins["caldav-bridge"];
if (!cb) { new Notice("CalDAV Bridge is not enabled"); return; }
```

### Create an event

```js
const r = await cb.api.createEvent({
  title: "Meeting with Anna",
  date: "2026-09-01",        // YYYY-MM-DD
  time: "10:00",             // HH:MM
  durationMinutes: 30,
  description: "Quarterly review",
  location: "Studio",
  alarmMinutes: 15           // omit to use the default from the settings
});
// r = { ok, status, message, uid, url }
```

Keep `r.uid` in the note's frontmatter: it is what lets you change or cancel the event later.

All-day events take no time and no duration:

```js
const r = await cb.api.createEvent({
  title: "Invoice deadline",
  date: "2026-09-01",
  allDay: true,
  alarmTime: "09:00"         // absolute reminder; "" or null for none
});
```

### Update, read and delete

```js
await cb.api.updateEvent(uid, { ...same fields, sequence: 3 });
const read = await cb.api.getEvent(uid);   // read.event = { title, date, time, ... }
await cb.api.deleteEvent(uid);
```

Every call resolves to an object and never throws. `ok` tells you whether it worked, `message` is ready to show in a `Notice`, and `status` is the HTTP status from the server. Deleting an event that is already gone counts as success.

### Other helpers

```js
cb.api.isConfigured();          // true when URL, user and password are set
await cb.api.testConnection();  // { ok, status, message }
cb.api.version();               // the plugin version
cb.api.defaultAlarmMinutes();   // the reminder set in the settings
```

### Dialogs

Both dialogs return `null` when the user cancels. Their option names are Spanish, kept that way for backwards compatibility with the scripts this plugin was written for.

```js
const data = await cb.api.form({
  titulo: "New expense",
  campos: [
    { id: "supplier", etiqueta: "Supplier", tipo: "texto", requerido: true },
    { id: "amount",   etiqueta: "Amount",   tipo: "texto", importe: true, requerido: true },
    { id: "category", etiqueta: "Category", tipo: "select",
      opciones: [{ valor: "Tools", texto: "Tools" }],
      nuevaOpcion: { texto: "New category", placeholder: "e.g. Travel" } },
    { id: "notes",    etiqueta: "Notes",    tipo: "area" },
    { id: "photo",    etiqueta: "Add a photo", tipo: "interruptor" }
  ]
});
```

Field types (`tipo`): `texto`, `area`, `select`, `fichas`, `fecha`, `hora`, `numero`, `interruptor`.
Checks: `requerido` (required), `importe` (amount, accepts `12,50` and `12.50`), `entero` (whole number).
When a `select` with `nuevaOpcion` is used to type a new value, the result also carries `<id>_nueva: true`.

`cb.api.taskForm({ projects, clients, estados, prioridades, duraciones, titulo })` opens a ready-made dialog for a task — project, client, title, status, priority, due date, all-day switch, time and duration, a calendar switch and notes — and hands the values back. It writes nothing: the calling script decides what the note looks like.

## Privacy and network

The plugin talks to one server only: the CalDAV address you type in the settings. Nothing else is sent anywhere, there is no telemetry, and no data leaves your vault other than the events you ask it to create.

## Development

There is no build step. `main.js` is the source, plain JavaScript with no dependencies beyond Obsidian's own API. To work on it, clone the repository into `<vault>/.obsidian/plugins/caldav-bridge/` and reload Obsidian after each change.

## License

[MIT](LICENSE) © Toni Santos
