'use strict';

/*
 * CalDAV Bridge for Obsidian
 * -------------------------
 * Creates, updates and deletes events on a CalDAV server.
 * Works on desktop and mobile (uses Obsidian's requestUrl, so no CORS).
 *
 * Usage from a QuickAdd or Templater script:
 *
 *   const cb = app.plugins.plugins["caldav-bridge"];
 *
 *   const r = await cb.api.createEvent({
 *     title, date: "2026-09-01", time: "10:00", durationMinutes: 30,
 *     description, location, alarmMinutes: 15
 *   });
 *
 *   // All-day event (no time, no duration):
 *   const r = await cb.api.createEvent({
 *     title, date: "2026-09-01", allDay: true,
 *     description, alarmTime: "09:00"   // reminder at that time, that day
 *   });
 *   // r = { ok, status, message, uid, url }   -> keep r.uid
 *
 *   await cb.api.updateEvent(uid, { ...same fields... });
 *   await cb.api.deleteEvent(uid);
 */

const obsidian = require('obsidian');
const { Plugin, Notice, PluginSettingTab, Setting, Modal, Platform, requestUrl } = obsidian;

const DEFAULT_SETTINGS = {
	url: '',
	username: '',
	password: '',
	notifyOnSuccess: true,
	alarmMinutes: 15,
	language: 'auto',
	ribbonEnabled: false,
	ribbonCommandName: '',
	ribbonIcon: 'calendar-plus',
	ribbonLabel: 'CalDAV Bridge',
};

/* ============================ language ============================
   The dialogs are also called from user scripts, so the texts live in a
   single table. 'auto' follows the Obsidian interface language when it can
   be read, and falls back to English.
================================================================= */

const STRINGS = {
	en: {
		save: 'Save',
		cancel: 'Cancel',
		form: 'Form',
		newOption: '➕ New',
		newTask: 'New task',
		project: 'Project',
		noProject: '🚫 No project',
		newProject: '➕ New project',
		newProjectPlaceholder: 'Name of the new project',
		clientLabel: 'Client — only when the project is new or there is no project',
		newClient: '➕ New client',
		newClientPlaceholder: 'Name of the new client',
		titleLabel: 'Title',
		titlePlaceholder: 'What do you need to do?',
		statusLabel: 'Status',
		priorityLabel: 'Priority',
		dueDate: 'Due date (optional)',
		today: 'Today',
		allDay: 'All day',
		timeLabel: 'Time',
		durationLabel: 'Duration (min)',
		otherDuration: 'Other...',
		minutesPlaceholder: 'minutes',
		addToCalendar: 'Add to calendar',
		notesLabel: 'Notes (optional)',
		statusDefault: 'Pending',
		priorityDefault: 'Medium',
		titleRequired: 'Give the task a title.',
		newProjectRequired: 'Type the name of the new project.',
		newClientRequired: 'Type the name of the new client.',
		clientRequired: 'Choose or type a client.',
		dateInvalid: 'The date is not valid.',
		timeRequired: 'Set a time, or tick "All day".',
		durationInvalid: 'The duration has to be a number of minutes greater than zero.',
		dateNeeded: 'It needs a date before it can go to the calendar.',
		missing: 'Missing: {label}.',
		integerField: '{label}: has to be a whole number greater than zero.',
		amountField: '{label}: type a number, for example 12.50.',
		amountPositive: '{label}: has to be greater than zero.',
		dateField: '{label}: the date is not valid.',
		timeField: '{label}: the time is not valid.',
		status401: 'Wrong username or password (401).',
		status403: 'The server denies access (403). Check the calendar permissions.',
		status404: 'The calendar URL does not exist (404). Check the address.',
		status405: 'The server does not allow that operation on that URL (405). It usually means the URL points to the wrong collection.',
		status409: 'Conflict (409). The target collection may not exist.',
		status412: 'The event already existed (412).',
		status415: 'The server rejects the event format (415).',
		status500: 'Server error ({status}). Try again later.',
		statusOther: '{context}: unexpected answer from the server ({status}).',
		ctxTestConnection: 'Connection test',
		ctxCreateEvent: 'Create event',
		ctxUpdateEvent: 'Update event',
		ctxReadEvent: 'Read event',
		ctxDeleteEvent: 'Delete event',
		notConfiguredSettings: 'The URL, username or password is missing in the CalDAV Bridge settings.',
		notConfigured: 'CalDAV Bridge is not configured (URL, username or password).',
		noReach: 'Could not reach the server: {error}',
		unexpected: 'Unexpected error: {error}',
		connectionOk: 'Connected to the CalDAV server.',
		noEventData: 'No event data was received.',
		eventNeedsTitle: 'The event needs a title.',
		badDate: 'Date is not valid: {date}. Expected YYYY-MM-DD.',
		badDateTime: 'Date or time is not valid: "{date}" "{time}". Expected YYYY-MM-DD and HH:MM.',
		badAlarmTime: 'Reminder time is not valid: {time}. Expected HH:MM.',
		missingUid: 'The event identifier is missing.',
		eventCreatedShort: 'Event created in the calendar',
		eventCreated: 'Event created in the calendar.',
		eventUpdatedShort: 'Event updated in the calendar',
		eventUpdated: 'Event updated in the calendar.',
		eventDeletedShort: 'Event deleted from the calendar',
		eventDeleted: 'Event deleted from the calendar.',
		eventAlreadyGone: 'The event was no longer in the calendar.',
		eventNotFound: 'The event no longer exists in the calendar.',
		eventUnreadable: 'The server returned something that could not be read as an event.',
		eventRead: 'Event read.',
		noModals: 'This version of Obsidian cannot open dialogs.',
		formOpenFailed: 'The dialog could not be opened: {error}',
		cmdTaskForm: 'Open task dialog (demo)',
		cmdLinked: 'Run linked command',
		cmdTest: 'Test server connection',
		cmdTestEvent: 'Create test event (tomorrow at 10:00)',
		demoTitle: 'Task dialog (demo)',
		demoProject: 'Example project',
		demoStatuses: 'Pending|In progress|Done|Cancelled',
		demoPriorities: 'Low|Medium|High|Urgent',
		demoCancelled: 'Dialog cancelled. The plugin works.',
		demoOk: 'The dialog works. Nothing was written: this was only a demo.',
		testEventTitle: 'CalDAV Bridge test',
		testEventDesc: 'Test event created by the CalDAV Bridge plugin.',
		linkedNotFound: 'No command called "{name}" was found. Check it in the CalDAV Bridge settings.',
		setUrl: 'Calendar URL',
		setUrlDesc: 'Full address of the calendar collection, ending in a slash.',
		setUser: 'Username',
		setUserDesc: 'Username of the calendar account.',
		setPassword: 'Password',
		setPasswordDesc: 'Application password from your provider. It is kept as plain text in the plugin data file inside your vault.',
		setAlarm: 'Default reminder (minutes before)',
		setAlarmDesc: 'Reminder added to every event. Use 0 for none.',
		setNotify: 'Notify when an event is created',
		setNotifyDesc: 'Show a notice every time an event reaches the server.',
		setLanguage: 'Language',
		setLanguageDesc: 'Language of the dialogs and messages.',
		langAuto: 'Automatic',
		setShortcut: 'Shortcut',
		setRibbon: 'Ribbon icon',
		setRibbonDesc: 'Add an icon to the sidebar that runs the command below.',
		setRibbonCommand: 'Command the icon runs',
		setRibbonCommandDesc: 'Name of the command as it appears in the command palette.',
		setRibbonLabel: 'Icon tooltip',
		setRibbonLabelDesc: 'Text shown when hovering over the icon.',
		setCheck: 'Check the shortcut',
		setCheckDesc: 'Look for that command and say whether it was found.',
		btnCheck: 'Check',
		cmdFound: 'Command found: {id}',
		cmdNotFound: 'That command was not found. Check the name.',
		setConnection: 'Connection',
		setTest: 'Test connection',
		setTestDesc: 'Check the URL and the credentials without creating anything.',
		btnTest: 'Test',
	},
	es: {
		save: 'Guardar',
		cancel: 'Cancelar',
		form: 'Formulario',
		newOption: '➕ Nueva',
		newTask: 'Nueva tarea',
		project: 'Proyecto',
		noProject: '🚫 Sin proyecto',
		newProject: '➕ Proyecto nuevo',
		newProjectPlaceholder: 'Nombre del proyecto nuevo',
		clientLabel: 'Cliente — solo si el proyecto es nuevo o no lleva proyecto',
		newClient: '➕ Cliente nuevo',
		newClientPlaceholder: 'Nombre del cliente nuevo',
		titleLabel: 'Título',
		titlePlaceholder: '¿Qué tienes que hacer?',
		statusLabel: 'Estado',
		priorityLabel: 'Prioridad',
		dueDate: 'Fecha límite (opcional)',
		today: 'Hoy',
		allDay: 'Todo el día',
		timeLabel: 'Hora',
		durationLabel: 'Duración (min)',
		otherDuration: 'Otra...',
		minutesPlaceholder: 'minutos',
		addToCalendar: 'Ponerla en el calendario',
		notesLabel: 'Notas (opcional)',
		statusDefault: 'Pendiente',
		priorityDefault: 'Media',
		titleRequired: 'Ponle un título a la tarea.',
		newProjectRequired: 'Escribe el nombre del proyecto nuevo.',
		newClientRequired: 'Escribe el nombre del cliente nuevo.',
		clientRequired: 'Elige o escribe un cliente.',
		dateInvalid: 'La fecha no es válida.',
		timeRequired: 'Pon una hora, o marca "Todo el día".',
		durationInvalid: 'La duración tiene que ser un número de minutos mayor que cero.',
		dateNeeded: 'Para ponerla en el calendario necesita una fecha.',
		missing: 'Falta: {label}.',
		integerField: '{label}: tiene que ser un número entero mayor que cero.',
		amountField: '{label}: escribe un número, por ejemplo 12,50.',
		amountPositive: '{label}: tiene que ser mayor que cero.',
		dateField: '{label}: la fecha no es válida.',
		timeField: '{label}: la hora no es válida.',
		status401: 'Usuario o contraseña incorrectos (401).',
		status403: 'El servidor deniega el acceso (403). Revisa los permisos del calendario.',
		status404: 'La URL del calendario no existe (404). Revisa la dirección.',
		status405: 'El servidor no admite esa operación en esa URL (405). Suele indicar que la URL apunta a la colección equivocada.',
		status409: 'Conflicto (409). La colección de destino puede no existir.',
		status412: 'El evento ya existía (412).',
		status415: 'El servidor rechaza el formato del evento (415).',
		status500: 'Error del servidor ({status}). Inténtalo más tarde.',
		statusOther: '{context}: respuesta inesperada del servidor ({status}).',
		ctxTestConnection: 'Prueba de conexión',
		ctxCreateEvent: 'Crear evento',
		ctxUpdateEvent: 'Actualizar evento',
		ctxReadEvent: 'Leer evento',
		ctxDeleteEvent: 'Borrar evento',
		notConfiguredSettings: 'Falta la URL, el usuario o la contraseña en los ajustes de CalDAV Bridge.',
		notConfigured: 'CalDAV Bridge no está configurado (URL, usuario o contraseña).',
		noReach: 'No se pudo contactar con el servidor: {error}',
		unexpected: 'Error inesperado: {error}',
		connectionOk: 'Conexión correcta con el servidor CalDAV.',
		noEventData: 'No se recibieron datos del evento.',
		eventNeedsTitle: 'El evento necesita un título.',
		badDate: 'Fecha no válida: {date}. Se espera AAAA-MM-DD.',
		badDateTime: 'Fecha u hora no válidas: "{date}" "{time}". Se espera AAAA-MM-DD y HH:MM.',
		badAlarmTime: 'Hora de aviso no válida: {time}. Se espera HH:MM.',
		missingUid: 'Falta el identificador del evento.',
		eventCreatedShort: 'Evento creado en el calendario',
		eventCreated: 'Evento creado en el calendario.',
		eventUpdatedShort: 'Evento actualizado en el calendario',
		eventUpdated: 'Evento actualizado en el calendario.',
		eventDeletedShort: 'Evento borrado del calendario',
		eventDeleted: 'Evento borrado del calendario.',
		eventAlreadyGone: 'El evento ya no estaba en el calendario.',
		eventNotFound: 'El evento ya no existe en el calendario.',
		eventUnreadable: 'El servidor devolvió algo que no se pudo interpretar como evento.',
		eventRead: 'Evento leído.',
		noModals: 'Esta versión de Obsidian no permite abrir formularios.',
		formOpenFailed: 'No se pudo abrir el formulario: {error}',
		cmdTaskForm: 'Abrir el formulario de tarea (prueba)',
		cmdLinked: 'Abrir el comando enlazado',
		cmdTest: 'Probar la conexión con el servidor',
		cmdTestEvent: 'Crear un evento de prueba (mañana a las 10:00)',
		demoTitle: 'Formulario de tarea (prueba)',
		demoProject: 'Proyecto de ejemplo',
		demoStatuses: 'Pendiente|En curso|Completada|Cancelada',
		demoPriorities: 'Baja|Media|Alta|Urgente',
		demoCancelled: 'Formulario cancelado. El plugin funciona.',
		demoOk: 'El formulario funciona. No se ha escrito nada: esto era solo una prueba.',
		testEventTitle: 'Prueba CalDAV Bridge',
		testEventDesc: 'Evento de prueba creado por el plugin CalDAV Bridge.',
		linkedNotFound: 'No encuentro ningún comando llamado "{name}". Revísalo en los ajustes de CalDAV Bridge.',
		setUrl: 'URL del calendario',
		setUrlDesc: 'Dirección completa de la colección, terminada en barra.',
		setUser: 'Usuario',
		setUserDesc: 'Nombre de usuario de la cuenta del calendario.',
		setPassword: 'Contraseña',
		setPasswordDesc: 'Contraseña de aplicación de tu proveedor. Se guarda en texto plano en el archivo de datos del plugin, dentro del vault.',
		setAlarm: 'Recordatorio por defecto (minutos antes)',
		setAlarmDesc: 'Aviso que se añade a cada evento. Pon 0 para no poner ninguno.',
		setNotify: 'Avisar al crear un evento',
		setNotifyDesc: 'Muestra un aviso cada vez que un evento llega al servidor.',
		setLanguage: 'Idioma',
		setLanguageDesc: 'Idioma de los formularios y los mensajes.',
		langAuto: 'Automático',
		setShortcut: 'Acceso directo',
		setRibbon: 'Icono en la barra lateral',
		setRibbonDesc: 'Añade un icono que abre el comando de abajo.',
		setRibbonCommand: 'Comando que abre el icono',
		setRibbonCommandDesc: 'Nombre del comando, tal como aparece en la paleta.',
		setRibbonLabel: 'Texto del icono',
		setRibbonLabelDesc: 'Lo que se ve al pasar el ratón por encima.',
		setCheck: 'Comprobar el acceso directo',
		setCheckDesc: 'Busca el comando y te dice si lo encuentra.',
		btnCheck: 'Comprobar',
		cmdFound: 'Comando encontrado: {id}',
		cmdNotFound: 'No encuentro ese comando. Revisa el nombre.',
		setConnection: 'Conexión',
		setTest: 'Probar la conexión',
		setTestDesc: 'Comprueba la URL y las credenciales sin crear nada.',
		btnTest: 'Probar',
	},
};

let LANG = 'en';

function detectLanguage() {
	try {
		const nav = (typeof navigator !== 'undefined' && navigator.language) ? navigator.language : '';
		if (String(nav).toLowerCase().startsWith('es')) return 'es';
	} catch (e) { /* fall back to English */ }
	return 'en';
}

function setLanguage(choice) {
	LANG = (choice === 'en' || choice === 'es') ? choice : detectLanguage();
}

/** Text by key, with optional {placeholders}. Falls back to English. */
function t(key, vars) {
	const table = STRINGS[LANG] || STRINGS.en;
	let s = table[key];
	if (s === undefined) s = STRINGS.en[key];
	if (s === undefined) return key;
	if (vars) {
		for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
	}
	return s;
}

/* ============================ utilities ============================ */

function pad2(n) {
	return String(n).padStart(2, '0');
}

function toICSStampUTC(date) {
	return (
		date.getUTCFullYear() + pad2(date.getUTCMonth() + 1) + pad2(date.getUTCDate()) +
		'T' + pad2(date.getUTCHours()) + pad2(date.getUTCMinutes()) + pad2(date.getUTCSeconds()) + 'Z'
	);
}

/** Bare date in ICS format (YYYYMMDD), for all-day events. */
function icsDateOnly(date) {
	return date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate());
}

/** Adds days to a date without touching the original (DST safe). */
function addDays(date, days) {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 0, 0, 0, 0);
}

function parseLocalDateTime(dateStr, timeStr) {
	const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr == null ? '' : dateStr).trim());
	if (!d) return null;
	let hh = 0, mm = 0;
	if (timeStr !== undefined && timeStr !== null && String(timeStr).trim() !== '') {
		const t = /^(\d{1,2}):(\d{2})$/.exec(String(timeStr).trim());
		if (!t) return null;
		hh = Number(t[1]); mm = Number(t[2]);
		if (hh > 23 || mm > 59) return null;
	}
	const year = Number(d[1]), month = Number(d[2]), day = Number(d[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;
	const date = new Date(year, month - 1, day, hh, mm, 0, 0);
	if (isNaN(date.getTime())) return null;
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
	return date;
}

function escapeICSText(value) {
	return String(value == null ? '' : value)
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r\n/g, '\\n')
		.replace(/\n/g, '\\n')
		.replace(/\r/g, '\\n');
}

function foldICSLine(line) {
	const encoder = new TextEncoder();
	const limit = 73;
	const parts = [];
	let current = '', bytes = 0;
	for (const ch of line) {
		const chBytes = encoder.encode(ch).length;
		if (bytes + chBytes > limit) { parts.push(current); current = ''; bytes = 0; }
		current += ch; bytes += chBytes;
	}
	parts.push(current);
	return parts.join('\r\n ');
}

function generateUID() {
	const a = Math.random().toString(36).slice(2, 10);
	const b = Math.random().toString(36).slice(2, 10);
	return `${Date.now()}-${a}${b}@obsidian-caldav-bridge`;
}

/** The file name on the server is derived from the UID in a stable way. */
function resourceNameFromUID(uid) {
	return String(uid == null ? '' : uid).replace(/[^A-Za-z0-9-]/g, '-');
}

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64UTF8(str) {
	const bytes = new TextEncoder().encode(str);
	let binary = '';
	for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
	if (typeof btoa === 'function') return btoa(binary);
	// Fallback without Node APIs, so the plugin stays desktop and mobile safe.
	let out = '';
	for (let i = 0; i < bytes.length; i += 3) {
		const b0 = bytes[i];
		const b1 = bytes[i + 1];
		const b2 = bytes[i + 2];
		out += B64_ALPHABET[b0 >> 2];
		out += B64_ALPHABET[((b0 & 3) << 4) | ((b1 === undefined ? 0 : b1) >> 4)];
		out += (b1 === undefined) ? '=' : B64_ALPHABET[((b1 & 15) << 2) | ((b2 === undefined ? 0 : b2) >> 6)];
		out += (b2 === undefined) ? '=' : B64_ALPHABET[b2 & 63];
	}
	return out;
}

function normalizeCollectionUrl(raw) {
	let url = String(raw == null ? '' : raw).trim();
	if (!url) return '';
	const q = url.indexOf('?'); if (q !== -1) url = url.slice(0, q);
	const h = url.indexOf('#'); if (h !== -1) url = url.slice(0, h);
	if (!url.endsWith('/')) url += '/';
	return url;
}

function buildICS(event) {
	const dateParam = event.allDay ? ';VALUE=DATE' : '';
	const lines = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Obsidian//CalDAV Bridge//EN',
		'CALSCALE:GREGORIAN',
		'BEGIN:VEVENT',
		`UID:${event.uid}`,
		`DTSTAMP:${event.dtstamp}`,
		`DTSTART${dateParam}:${event.dtstart}`,
		`DTEND${dateParam}:${event.dtend}`,
		`SUMMARY:${escapeICSText(event.title)}`,
	];

	if (event.description) lines.push(`DESCRIPTION:${escapeICSText(event.description)}`);
	if (event.location) lines.push(`LOCATION:${escapeICSText(event.location)}`);
	if (Number.isFinite(event.sequence)) lines.push(`SEQUENCE:${event.sequence}`);

	// For a timed event the reminder is relative to the start. For an all-day
	// event "15 minutes before" means nothing, so it is absolute.
	if (event.alarmStamp) {
		lines.push(
			'BEGIN:VALARM',
			'ACTION:DISPLAY',
			`DESCRIPTION:${escapeICSText(event.title)}`,
			`TRIGGER;VALUE=DATE-TIME:${event.alarmStamp}`,
			'END:VALARM'
		);
	} else if (Number.isFinite(event.alarmMinutes) && event.alarmMinutes > 0) {
		lines.push(
			'BEGIN:VALARM',
			'ACTION:DISPLAY',
			`DESCRIPTION:${escapeICSText(event.title)}`,
			`TRIGGER:-PT${Math.round(event.alarmMinutes)}M`,
			'END:VALARM'
		);
	}

	lines.push('END:VEVENT', 'END:VCALENDAR');
	return lines.map(foldICSLine).join('\r\n') + '\r\n';
}


/** Undoes the line folding of an .ics file (RFC 5545). */
function unfoldICS(text) {
	return String(text == null ? '' : text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
}

/** Undoes the escaping of an iCalendar text value. */
function unescapeICSText(value) {
	return String(value == null ? '' : value)
		.replace(/\\n/gi, '\n')
		.replace(/\\,/g, ',')
		.replace(/\\;/g, ';')
		.replace(/\\\\/g, '\\');
}

/**
 * Turns an iCalendar stamp into a Date.
 * Accepts 20260901T080000Z (UTC) and 20260901T100000 (local time).
 * Returns null when it is not recognised.
 */
function parseICSStamp(value) {
	const v = String(value == null ? '' : value).trim();
	const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(v);
	if (m) {
		const [, y, mo, d, h, mi, se, z] = m;
		const date = z === 'Z'
			? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +se))
			: new Date(+y, +mo - 1, +d, +h, +mi, +se);
		return isNaN(date.getTime()) ? null : date;
	}
	// Bare date (all-day event)
	const d2 = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
	if (d2) {
		const date = new Date(+d2[1], +d2[2] - 1, +d2[3], 0, 0, 0);
		return isNaN(date.getTime()) ? null : date;
	}
	return null;
}

/** Reads the first VEVENT of an .ics file. Returns null when there is none. */
function parseICSEvent(text) {
	const lines = unfoldICS(text).split(/\r?\n/);
	let dentro = false;
	const campos = {};
	const params = {};
	for (const line of lines) {
		const t = line.trim();
		if (t === 'BEGIN:VEVENT') { dentro = true; continue; }
		if (t === 'END:VEVENT') break;
		if (!dentro) continue;
		const sep = t.indexOf(':');
		if (sep === -1) continue;
		const izquierda = t.slice(0, sep);
		const valor = t.slice(sep + 1);
		const nombre = izquierda.split(';')[0].toUpperCase();
		if (campos[nombre] === undefined) {
			campos[nombre] = valor;
			params[nombre] = izquierda.slice(nombre.length).toUpperCase();
		}
	}
	if (!campos.DTSTART) return null;

	const start = parseICSStamp(campos.DTSTART);
	const end = campos.DTEND ? parseICSStamp(campos.DTEND) : null;
	if (!start) return null;

	const allDay = (params.DTSTART || '').includes('VALUE=DATE') && !/T/.test(campos.DTSTART);
	const durationMinutes = (allDay || !end) ? null : Math.round((end.getTime() - start.getTime()) / 60000);

	return {
		uid: campos.UID || '',
		title: unescapeICSText(campos.SUMMARY || ''),
		description: unescapeICSText(campos.DESCRIPTION || ''),
		location: unescapeICSText(campos.LOCATION || ''),
		date: `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`,
		time: allDay ? '' : `${pad2(start.getHours())}:${pad2(start.getMinutes())}`,
		allDay,
		durationMinutes,
		sequence: Number(campos.SEQUENCE) || 0,
	};
}

function describeStatus(status, contextKey) {
	if (status === 401) return t('status401');
	if (status === 403) return t('status403');
	if (status === 404) return t('status404');
	if (status === 405) return t('status405');
	if (status === 409) return t('status409');
	if (status === 412) return t('status412');
	if (status === 415) return t('status415');
	if (status >= 500) return t('status500', { status });
	return t('statusOther', { context: t(contextKey), status });
}

/* ===================== task dialog =====================
   A single screen to collect a task. It does NOT write notes: it gathers
   the data and hands it back, so the calling script stays the only place
   that decides what a note looks like.

   Usage:
     const data = await cb.api.taskForm({
       projects: [{id, label}], estados: [...], prioridades: [...],
       duraciones: [30,60,90,120], titulo: "New task"
     });
     // data = null when cancelled, or an object with what was chosen
   The option names are kept in Spanish for backwards compatibility with
   the scripts this plugin was written for.
================================================================= */

/* On mobile the keyboard covers the lower half of the window. Two things
   fix it: a spacer as tall as the keyboard, and scrolling the focused field
   into view. Returns a function that undoes everything: it has to be called
   on close or the listeners stay behind. */
/* On opening, the dialog has to start at its first field. On desktop the
   first text box is focused for convenience; on mobile it is not, because
   focusing raises the keyboard and pushes the first fields out of sight. */
function abrirArriba(wrap, primerCampo) {
	const esMovil = !!(Platform && (Platform.isMobile || Platform.isAndroidApp || Platform.isIosApp));
	setTimeout(() => {
		try { wrap.scrollTop = 0; } catch (e) { /* nada */ }
		if (!esMovil && primerCampo && primerCampo.focus) {
			try { primerCampo.focus(); } catch (e) { /* nada */ }
		}
	}, 0);
}

function attachKeyboardHandling(contentEl, wrap, doc) {
	const esMovil = !!(Platform && (Platform.isMobile || Platform.isAndroidApp || Platform.isIosApp));
	if (esMovil) wrap.classList.add('cbf-movil');

	const aire = doc.createElement('div');
	aire.className = 'cbf-aire';
	wrap.appendChild(aire);

	const espaciador = doc.createElement('div');
	espaciador.className = 'cbf-espaciador';
	wrap.appendChild(espaciador);

	const vv = (typeof window !== 'undefined') ? window.visualViewport : null;
	const ventana = (typeof window !== 'undefined') ? window : null;

	const alturaTeclado = () => {
		if (!vv || !ventana) return 0;
		const dif = ventana.innerHeight - vv.height - (vv.offsetTop || 0);
		return dif > 80 ? Math.round(dif) : 0;   // menos de 80px no es un teclado
	};

	const ajustar = () => {
		espaciador.style.height = alturaTeclado() + 'px';
	};

	/* On mobile the field is moved to the top edge of the container, where
	   there is most room left. It is computed by hand instead of trusting
	   scrollIntoView, which is unreliable inside a nested container. */
	const aLaVista = (el) => {
		if (!el) return;
		if (esMovil && typeof el.getBoundingClientRect === 'function' && typeof wrap.getBoundingClientRect === 'function') {
			try {
				const arriba = el.getBoundingClientRect().top - wrap.getBoundingClientRect().top + wrap.scrollTop;
				wrap.scrollTop = Math.max(0, arriba - 8);
				return;
			} catch (e) { /* si falla, se prueba lo de abajo */ }
		}
		if (typeof el.scrollIntoView === 'function') {
			try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* nada */ }
		}
	};

	/* The keyboard takes a moment to appear, so it is measured twice. If the
	   user taps another field meanwhile, pending adjustments are cancelled:
	   otherwise the previous field's adjustment lands late and wins. */
	let pendientes = [];
	const cancelar = () => { for (const t of pendientes) clearTimeout(t); pendientes = []; };
	const alEnfocar = (ev) => {
		const el = ev && ev.target;
		if (!el || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName || '')) return;
		cancelar();
		pendientes.push(setTimeout(() => { ajustar(); aLaVista(el); }, 120));
		pendientes.push(setTimeout(() => { ajustar(); aLaVista(el); }, 400));
	};

	contentEl.addEventListener('focusin', alEnfocar);
	if (vv && vv.addEventListener) {
		vv.addEventListener('resize', ajustar);
		vv.addEventListener('scroll', ajustar);
	}

	return () => {
		cancelar();
		contentEl.removeEventListener('focusin', alEnfocar);
		if (vv && vv.removeEventListener) {
			vv.removeEventListener('resize', ajustar);
			vv.removeEventListener('scroll', ajustar);
		}
	};
}

function hoyISO(ahora) {
	const d = ahora instanceof Date ? ahora : new Date();
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Validates what the dialog collected. Returns {ok, message}. */
function validateTaskForm(datos) {
	if (!datos.titulo || !String(datos.titulo).trim()) {
		return { ok: false, message: t('titleRequired') };
	}
	if (datos.proyectoNuevo && !String(datos.proyecto || '').trim()) {
		return { ok: false, message: t('newProjectRequired') };
	}
	if (datos.clienteNuevo && !String(datos.cliente || '').trim()) {
		return { ok: false, message: t('newClientRequired') };
	}
	if ((datos.proyectoNuevo || datos.proyecto === '__none__') && !String(datos.cliente || '').trim()) {
		return { ok: false, message: t('clientRequired') };
	}
	if (datos.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) {
		return { ok: false, message: t('dateInvalid') };
	}
	if (datos.fecha && !datos.todoElDia) {
		if (!/^\d{1,2}:\d{2}$/.test(String(datos.hora || ''))) {
			return { ok: false, message: t('timeRequired') };
		}
		const dur = Number(datos.duracionMinutos);
		if (!Number.isFinite(dur) || dur <= 0) {
			return { ok: false, message: t('durationInvalid') };
		}
	}
	if (!datos.fecha && datos.alCalendario) {
		return { ok: false, message: t('dateNeeded') };
	}
	return { ok: true, message: '' };
}

const TaskFormModal = Modal ? class TaskFormModal extends Modal {
	constructor(app, opciones, resolver) {
		super(app);
		this.o = opciones || {};
		this.resolver = resolver;
		this.resuelto = false;
		this.estado = {
			proyecto: (this.o.projects && this.o.projects.length) ? this.o.projects[0].id : '__none__',
			proyectoNuevo: false,
			cliente: '',
			clienteNuevo: false,
			titulo: '',
			estadoTarea: (this.o.estados || [t('statusDefault')])[0],
			prioridad: (this.o.prioridades || [t('priorityDefault')])[1] || (this.o.prioridades || [t('priorityDefault')])[0],
			fecha: '',
			todoElDia: true,
			hora: '',
			duracionMinutos: 60,
			notas: '',
			alCalendario: false,
		};
	}

	/* Important: close the modal first and only then continue. Resolving
	   earlier lets the caller open its own modal while this one is still on
	   screen, and closing this one then takes the new one down with it. */
	cerrarCon(valor) {
		if (this.resuelto) return;
		this.resuelto = true;
		const seguir = this.resolver;
		this.close();
		setTimeout(() => seguir(valor), 0);
	}

	onOpen() {
		const { contentEl } = this;
		const doc = contentEl.ownerDocument || document;
		contentEl.empty ? contentEl.empty() : (contentEl.textContent = '');

		const h = doc.createElement('h3');
		h.textContent = this.o.titulo || t('newTask');
		contentEl.appendChild(h);

		const wrap = doc.createElement('div');
		wrap.className = 'cbf-wrap';
		contentEl.appendChild(wrap);

		const campo = (etiqueta) => {
			const c = doc.createElement('div');
			c.className = 'cbf-campo';
			if (etiqueta) {
				const l = doc.createElement('div');
				l.className = 'cbf-etiqueta';
				l.textContent = etiqueta;
				c.appendChild(l);
			}
			wrap.appendChild(c);
			return c;
		};

		// --- Project
		const cProy = campo(t('project'));
		const selProy = doc.createElement('select');
		for (const p of (this.o.projects || [])) {
			const op = doc.createElement('option');
			op.value = p.id; op.textContent = p.label;
			selProy.appendChild(op);
		}
		/* Chaining this dialog with QuickAdd's own prompts causes stacked
		   modals, so a new project is offered from inside this one. */
		const opSin = doc.createElement('option');
		opSin.value = '__none__'; opSin.textContent = t('noProject');
		selProy.appendChild(opSin);
		const opNuevoProy = doc.createElement('option');
		opNuevoProy.value = VALOR_NUEVA; opNuevoProy.textContent = t('newProject');
		selProy.appendChild(opNuevoProy);

		const inpProyNuevo = doc.createElement('input');
		inpProyNuevo.type = 'text';
		inpProyNuevo.className = 'cbf-oculto';
		inpProyNuevo.placeholder = t('newProjectPlaceholder');
		inpProyNuevo.addEventListener('input', () => {
			if (selProy.value === VALOR_NUEVA) this.estado.proyecto = inpProyNuevo.value;
		});

		if (!(this.o.projects || []).length) selProy.value = VALOR_NUEVA;
		else selProy.value = this.estado.proyecto;

		const sincronizarProy = () => {
			const nuevo = selProy.value === VALOR_NUEVA;
			inpProyNuevo.classList.toggle('cbf-oculto', !nuevo);
			this.estado.proyectoNuevo = nuevo;
			this.estado.proyecto = nuevo ? inpProyNuevo.value : selProy.value;
			if (cCli) cCli.classList.toggle('cbf-oculto', !(nuevo || selProy.value === '__none__'));
		};
		selProy.addEventListener('change', sincronizarProy);
		cProy.appendChild(selProy);
		cProy.appendChild(inpProyNuevo);

		// --- Client: only needed when the project is new or there is none
		const cCli = campo(t('clientLabel'));
		const selCli = doc.createElement('select');
		for (const c of (this.o.clients || [])) {
			const op = doc.createElement('option');
			op.value = c.id; op.textContent = c.label;
			selCli.appendChild(op);
		}
		const opNuevoCli = doc.createElement('option');
		opNuevoCli.value = VALOR_NUEVA; opNuevoCli.textContent = t('newClient');
		selCli.appendChild(opNuevoCli);
		const inpCliNuevo = doc.createElement('input');
		inpCliNuevo.type = 'text';
		inpCliNuevo.className = 'cbf-oculto';
		inpCliNuevo.placeholder = t('newClientPlaceholder');
		inpCliNuevo.addEventListener('input', () => {
			if (selCli.value === VALOR_NUEVA) this.estado.cliente = inpCliNuevo.value;
		});
		if (!(this.o.clients || []).length) selCli.value = VALOR_NUEVA;
		this.estado.cliente = selCli.value === VALOR_NUEVA ? '' : selCli.value;
		const sincronizarCli = () => {
			const nuevo = selCli.value === VALOR_NUEVA;
			inpCliNuevo.classList.toggle('cbf-oculto', !nuevo);
			this.estado.clienteNuevo = nuevo;
			this.estado.cliente = nuevo ? inpCliNuevo.value : selCli.value;
		};
		selCli.addEventListener('change', sincronizarCli);
		cCli.appendChild(selCli);
		cCli.appendChild(inpCliNuevo);
		sincronizarProy();
		sincronizarCli();

		// --- Title
		const cTit = campo(t('titleLabel'));
		const inpTit = doc.createElement('input');
		inpTit.type = 'text';
		inpTit.placeholder = t('titlePlaceholder');
		inpTit.addEventListener('input', () => { this.estado.titulo = inpTit.value; });
		cTit.appendChild(inpTit);
		this.primerCampo = inpTit;

		// --- Status and priority chips
		const fichas = (contenedor, valores, actual, alElegir) => {
			const caja = doc.createElement('div');
			caja.className = 'cbf-fichas';
			const botones = [];
			for (const v of valores) {
				const b = doc.createElement('div');
				b.className = 'cbf-ficha' + (v === actual ? ' is-activa' : '');
				b.textContent = v;
				b.addEventListener('click', () => {
					for (const otro of botones) otro.classList.remove('is-activa');
					b.classList.add('is-activa');
					alElegir(v);
				});
				botones.push(b);
				caja.appendChild(b);
			}
			contenedor.appendChild(caja);
			return botones;
		};
		fichas(campo(t('statusLabel')), this.o.estados || [t('statusDefault')], this.estado.estadoTarea, v => { this.estado.estadoTarea = v; });
		fichas(campo(t('priorityLabel')), this.o.prioridades || [t('priorityDefault')], this.estado.prioridad, v => { this.estado.prioridad = v; });

		// --- Date
		const cFecha = campo(t('dueDate'));
		const filaFecha = doc.createElement('div');
		filaFecha.className = 'cbf-fila';
		const inpFecha = doc.createElement('input');
		inpFecha.type = 'date';
		const btnHoy = doc.createElement('button');
		btnHoy.type = 'button';
		btnHoy.textContent = t('today');
		btnHoy.addEventListener('click', () => {
			inpFecha.value = hoyISO(this.o.ahora);
			this.estado.fecha = inpFecha.value;
			refrescar();
		});
		const cf = doc.createElement('div'); cf.className = 'cbf-campo'; cf.appendChild(inpFecha);
		filaFecha.appendChild(cf);
		filaFecha.appendChild(btnHoy);
		cFecha.appendChild(filaFecha);
		inpFecha.addEventListener('change', () => { this.estado.fecha = inpFecha.value; refrescar(); });
		inpFecha.addEventListener('input', () => { this.estado.fecha = inpFecha.value; refrescar(); });

		// --- All day
		const cajaDia = doc.createElement('div');
		cajaDia.className = 'cbf-interruptor cbf-oculto';
		const lblDia = doc.createElement('label');
		lblDia.textContent = t('allDay');
		const chkDia = doc.createElement('input');
		chkDia.type = 'checkbox';
		chkDia.checked = true;
		chkDia.addEventListener('change', () => { this.estado.todoElDia = chkDia.checked; refrescar(); });
		lblDia.addEventListener('click', () => { chkDia.checked = !chkDia.checked; this.estado.todoElDia = chkDia.checked; refrescar(); });
		cajaDia.appendChild(lblDia);
		cajaDia.appendChild(chkDia);
		wrap.appendChild(cajaDia);

		// --- Time and duration
		const cHoras = doc.createElement('div');
		cHoras.className = 'cbf-fila cbf-oculto';
		const cIni = doc.createElement('div'); cIni.className = 'cbf-campo';
		const lIni = doc.createElement('div'); lIni.className = 'cbf-etiqueta'; lIni.textContent = t('timeLabel');
		const inpHora = doc.createElement('input'); inpHora.type = 'time';
		inpHora.addEventListener('change', () => { this.estado.hora = inpHora.value; });
		inpHora.addEventListener('input', () => { this.estado.hora = inpHora.value; });
		cIni.appendChild(lIni); cIni.appendChild(inpHora);
		const cDur = doc.createElement('div'); cDur.className = 'cbf-campo';
		const lDur = doc.createElement('div'); lDur.className = 'cbf-etiqueta'; lDur.textContent = t('durationLabel');
		const selDur = doc.createElement('select');
		for (const d of (this.o.duraciones || [30, 60, 90, 120])) {
			const op = doc.createElement('option');
			op.value = String(d); op.textContent = String(d);
			selDur.appendChild(op);
		}
		const opOtra = doc.createElement('option');
		opOtra.value = '__otra__'; opOtra.textContent = t('otherDuration');
		selDur.appendChild(opOtra);
		const inpDur = doc.createElement('input');
		inpDur.type = 'number'; inpDur.min = '1'; inpDur.className = 'cbf-oculto'; inpDur.placeholder = t('minutesPlaceholder');
		selDur.value = String(this.estado.duracionMinutos);
		selDur.addEventListener('change', () => {
			if (selDur.value === '__otra__') {
				inpDur.classList.remove('cbf-oculto');
				this.estado.duracionMinutos = Number(inpDur.value) || 0;
			} else {
				inpDur.classList.add('cbf-oculto');
				this.estado.duracionMinutos = Number(selDur.value);
			}
		});
		inpDur.addEventListener('input', () => { this.estado.duracionMinutos = Number(inpDur.value) || 0; });
		cDur.appendChild(lDur); cDur.appendChild(selDur); cDur.appendChild(inpDur);
		cHoras.appendChild(cIni); cHoras.appendChild(cDur);
		wrap.appendChild(cHoras);

		// --- Calendar
		const cajaCal = doc.createElement('div');
		cajaCal.className = 'cbf-interruptor cbf-oculto';
		const lblCal = doc.createElement('label');
		lblCal.textContent = t('addToCalendar');
		const chkCal = doc.createElement('input');
		chkCal.type = 'checkbox';
		chkCal.addEventListener('change', () => { this.estado.alCalendario = chkCal.checked; });
		lblCal.addEventListener('click', () => { chkCal.checked = !chkCal.checked; this.estado.alCalendario = chkCal.checked; });
		cajaCal.appendChild(lblCal);
		cajaCal.appendChild(chkCal);
		wrap.appendChild(cajaCal);

		// --- Notes
		const cNotas = campo(t('notesLabel'));
		const txtNotas = doc.createElement('textarea');
		txtNotas.addEventListener('input', () => { this.estado.notas = txtNotas.value; });
		cNotas.appendChild(txtNotas);

		// --- Error line and buttons
		const err = doc.createElement('div');
		err.className = 'cbf-error';
		wrap.appendChild(err);

		const botones = doc.createElement('div');
		botones.className = 'cbf-botones';
		const btnCancelar = doc.createElement('button');
		btnCancelar.type = 'button';
		btnCancelar.textContent = t('cancel');
		btnCancelar.addEventListener('click', () => this.cerrarCon(null));
		const btnGuardar = doc.createElement('button');
		btnGuardar.type = 'button';
		btnGuardar.className = 'mod-cta';
		btnGuardar.textContent = t('save');
		botones.appendChild(btnCancelar);
		botones.appendChild(btnGuardar);
		wrap.appendChild(botones);

		// Shows or hides depending on what was chosen
		const refrescar = () => {
			const tieneFecha = !!this.estado.fecha;
			cajaDia.classList.toggle('cbf-oculto', !tieneFecha);
			cajaCal.classList.toggle('cbf-oculto', !tieneFecha);
			cHoras.classList.toggle('cbf-oculto', !tieneFecha || this.estado.todoElDia);
			if (!tieneFecha) {
				this.estado.alCalendario = false;
				chkCal.checked = false;
			}
		};
		this.refrescar = refrescar;
		refrescar();

		const guardar = () => {
			const v = validateTaskForm(this.estado);
			if (!v.ok) { err.textContent = v.message; return; }
			err.textContent = '';
			const salida = {
				proyecto: this.estado.proyecto,
				proyectoNuevo: !!this.estado.proyectoNuevo,
				cliente: this.estado.cliente || '',
				clienteNuevo: !!this.estado.clienteNuevo,
				titulo: String(this.estado.titulo).trim(),
				estadoTarea: this.estado.estadoTarea,
				prioridad: this.estado.prioridad,
				fecha: this.estado.fecha || '',
				todoElDia: !!this.estado.fecha && !!this.estado.todoElDia,
				hora: (this.estado.fecha && !this.estado.todoElDia) ? this.estado.hora : '',
				duracionMinutos: (this.estado.fecha && !this.estado.todoElDia) ? Number(this.estado.duracionMinutos) : 0,
				notas: this.estado.notas || '',
				alCalendario: !!this.estado.fecha && !!this.estado.alCalendario,
			};
			this.cerrarCon(salida);
		};
		this.guardar = guardar;
		btnGuardar.addEventListener('click', guardar);

		contentEl.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter' && ev.target && ev.target.tagName !== 'TEXTAREA') {
				ev.preventDefault();
				guardar();
			}
		});

		this.soltarTeclado = attachKeyboardHandling(contentEl, wrap, doc);
		abrirArriba(wrap, inpTit);
	}

	onClose() {
		if (this.soltarTeclado) { this.soltarTeclado(); this.soltarTeclado = null; }
		if (this.contentEl && this.contentEl.empty) this.contentEl.empty();
		this.cerrarCon(null);
	}
} : null;

/* ===================== generic dialog =====================
   One modal built from a list of field definitions. It knows nothing about
   the vault: it gathers data and hands it back.

     const data = await cb.api.form({
       titulo: "New expense",
       campos: [
         {id:"supplier", etiqueta:"Supplier", tipo:"texto", requerido:true},
         {id:"amount", etiqueta:"Amount", tipo:"texto", importe:true, requerido:true},
         {id:"category", etiqueta:"Category", tipo:"select",
          opciones:[{valor:"Tools", texto:"Tools"}],
          nuevaOpcion:{texto:"New category", placeholder:"e.g. Travel"}},
         {id:"notes", etiqueta:"Notes", tipo:"area"},
         {id:"photo", etiqueta:"Add a photo", tipo:"interruptor"}
       ]
     });
     // null when cancelled. Using "new option" also returns category_nueva: true

   Field types (tipo): texto, area, select, fichas, fecha, hora, numero, interruptor
   Checks: requerido (required), importe (amount), entero (whole number)
   The key names are Spanish for backwards compatibility with existing scripts.
================================================================= */

const VALOR_NUEVA = '__nueva__';

/** Accepts 125,50 / 125.50 / 125. Returns NaN when it is not an amount. */
function parseImporteForm(valor) {
	const t = String(valor == null ? '' : valor).trim().replace(/\s|€/g, '').replace(',', '.');
	if (!/^\d+(\.\d+)?$/.test(t)) return NaN;
	return Number(t);
}

/** Validates the fields against their definition. Returns {ok, message, id}. */
function validateForm(campos, datos) {
	for (const c of (campos || [])) {
		const v = datos[c.id];
		const etiqueta = c.etiqueta || c.id;
		if (c.tipo === 'interruptor') continue;
		const vacio = (v === undefined || v === null || String(v).trim() === '');
		if (c.requerido && vacio) {
			return { ok: false, message: t('missing', { label: etiqueta }), id: c.id };
		}
		if (c.entero && !vacio) {
			const n = Number(String(v).trim());
			if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
				return { ok: false, message: t('integerField', { label: etiqueta }), id: c.id };
			}
		}
		if (c.importe && !vacio) {
			const n = parseImporteForm(v);
			if (!Number.isFinite(n)) return { ok: false, message: t('amountField', { label: etiqueta }), id: c.id };
			if (n <= 0) return { ok: false, message: t('amountPositive', { label: etiqueta }), id: c.id };
		}
		if (c.tipo === 'fecha' && !vacio && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
			return { ok: false, message: t('dateField', { label: etiqueta }), id: c.id };
		}
		if (c.tipo === 'hora' && !vacio && !/^\d{1,2}:\d{2}$/.test(String(v))) {
			return { ok: false, message: t('timeField', { label: etiqueta }), id: c.id };
		}
	}
	return { ok: true, message: '', id: '' };
}

const GenericFormModal = Modal ? class GenericFormModal extends Modal {
	constructor(app, opciones, resolver) {
		super(app);
		this.o = opciones || {};
		this.campos = this.o.campos || [];
		this.resolver = resolver;
		this.resuelto = false;
		this.datos = {};
		this.nuevas = {};
		for (const c of this.campos) {
			if (c.tipo === 'interruptor') this.datos[c.id] = !!c.valor;
			else if (c.valor !== undefined) this.datos[c.id] = c.valor;
			else if (c.tipo === 'select' && c.opciones && c.opciones.length) this.datos[c.id] = c.opciones[0].valor;
			else if (c.tipo === 'fichas' && c.opciones && c.opciones.length) this.datos[c.id] = c.opciones[0].valor;
			else this.datos[c.id] = '';
		}
	}

	cerrarCon(valor) {
		if (this.resuelto) return;
		this.resuelto = true;
		const seguir = this.resolver;
		this.close();
		setTimeout(() => seguir(valor), 0);
	}

	onOpen() {
		const { contentEl } = this;
		const doc = contentEl.ownerDocument || document;
		if (contentEl.empty) contentEl.empty();

		const h = doc.createElement('h3');
		h.textContent = this.o.titulo || t('form');
		contentEl.appendChild(h);

		const wrap = doc.createElement('div');
		wrap.className = 'cbf-wrap';
		contentEl.appendChild(wrap);

		let primero = null;

		for (const c of this.campos) {
			if (c.tipo === 'interruptor') {
				const caja = doc.createElement('div');
				caja.className = 'cbf-interruptor';
				const lbl = doc.createElement('label');
				lbl.textContent = c.etiqueta || c.id;
				const chk = doc.createElement('input');
				chk.type = 'checkbox';
				chk.checked = !!this.datos[c.id];
				const cambiar = () => { this.datos[c.id] = chk.checked; };
				chk.addEventListener('change', cambiar);
				lbl.addEventListener('click', () => { chk.checked = !chk.checked; cambiar(); });
				caja.appendChild(lbl);
				caja.appendChild(chk);
				wrap.appendChild(caja);
				continue;
			}

			const campo = doc.createElement('div');
			campo.className = 'cbf-campo';
			if (c.etiqueta) {
				const l = doc.createElement('div');
				l.className = 'cbf-etiqueta';
				l.textContent = c.etiqueta + (c.requerido ? ' *' : '');
				campo.appendChild(l);
			}

			if (c.tipo === 'fichas') {
				const caja = doc.createElement('div');
				caja.className = 'cbf-fichas';
				const botones = [];
				for (const op of (c.opciones || [])) {
					const b = doc.createElement('div');
					b.className = 'cbf-ficha' + (op.valor === this.datos[c.id] ? ' is-activa' : '');
					b.textContent = op.texto;
					b.addEventListener('click', () => {
						for (const otro of botones) otro.classList.remove('is-activa');
						b.classList.add('is-activa');
						this.datos[c.id] = op.valor;
					});
					botones.push(b);
					caja.appendChild(b);
				}
				campo.appendChild(caja);
			} else if (c.tipo === 'select') {
				const sel = doc.createElement('select');
				for (const op of (c.opciones || [])) {
					const o = doc.createElement('option');
					o.value = String(op.valor); o.textContent = op.texto;
					sel.appendChild(o);
				}
				/* The text box for a new option is only created when that
				   dropdown allows one. Otherwise an invisible input would sit
				   in the tab order. */
				let inpNueva = null;
				if (c.nuevaOpcion) {
					const o = doc.createElement('option');
					o.value = VALOR_NUEVA; o.textContent = c.nuevaOpcion.texto || t('newOption');
					sel.appendChild(o);
					inpNueva = doc.createElement('input');
					inpNueva.type = 'text';
					inpNueva.className = 'cbf-oculto';
					inpNueva.placeholder = c.nuevaOpcion.placeholder || '';
					inpNueva.addEventListener('input', () => {
						if (sel.value === VALOR_NUEVA) this.datos[c.id] = inpNueva.value;
					});
				}
				sel.value = String(this.datos[c.id]);
				/* With no options at all the dropdown starts on "new", so the
				   text box has to be visible from the start. */
				if (inpNueva && (!c.opciones || !c.opciones.length)) sel.value = VALOR_NUEVA;
				const sincronizar = () => {
					if (inpNueva && sel.value === VALOR_NUEVA) {
						inpNueva.classList.remove('cbf-oculto');
						this.nuevas[c.id] = true;
						this.datos[c.id] = inpNueva.value;
					} else {
						if (inpNueva) inpNueva.classList.add('cbf-oculto');
						this.nuevas[c.id] = false;
						this.datos[c.id] = sel.value;
					}
				};
				sel.addEventListener('change', sincronizar);
				if (sel.value === VALOR_NUEVA) sincronizar();
				campo.appendChild(sel);
				if (inpNueva) campo.appendChild(inpNueva);
			} else if (c.tipo === 'area') {
				const ta = doc.createElement('textarea');
				ta.value = String(this.datos[c.id] || '');
				if (c.placeholder) ta.placeholder = c.placeholder;
				ta.addEventListener('input', () => { this.datos[c.id] = ta.value; });
				campo.appendChild(ta);
			} else {
				const inp = doc.createElement('input');
				inp.type = c.tipo === 'fecha' ? 'date' : c.tipo === 'hora' ? 'time' : c.tipo === 'numero' ? 'number' : 'text';
				if (c.importe) inp.setAttribute('inputmode', 'decimal');
				if (c.placeholder) inp.placeholder = c.placeholder;
				inp.value = String(this.datos[c.id] || '');
				const cambiar = () => { this.datos[c.id] = inp.value; };
				inp.addEventListener('input', cambiar);
				inp.addEventListener('change', cambiar);
				campo.appendChild(inp);
				if (!primero) primero = inp;
			}

			wrap.appendChild(campo);
		}

		const err = doc.createElement('div');
		err.className = 'cbf-error';
		wrap.appendChild(err);

		const botones = doc.createElement('div');
		botones.className = 'cbf-botones';
		const btnCancelar = doc.createElement('button');
		btnCancelar.type = 'button';
		btnCancelar.textContent = t('cancel');
		btnCancelar.addEventListener('click', () => this.cerrarCon(null));
		const btnGuardar = doc.createElement('button');
		btnGuardar.type = 'button';
		btnGuardar.className = 'mod-cta';
		btnGuardar.textContent = this.o.guardar || t('save');
		botones.appendChild(btnCancelar);
		botones.appendChild(btnGuardar);
		wrap.appendChild(botones);

		const guardar = () => {
			const v = validateForm(this.campos, this.datos);
			if (!v.ok) { err.textContent = v.message; return; }
			err.textContent = '';
			const salida = {};
			for (const c of this.campos) {
				salida[c.id] = (typeof this.datos[c.id] === 'string') ? this.datos[c.id].trim() : this.datos[c.id];
				if (this.nuevas[c.id]) salida[c.id + '_nueva'] = true;
			}
			this.cerrarCon(salida);
		};
		btnGuardar.addEventListener('click', guardar);

		contentEl.addEventListener('keydown', (ev) => {
			if (ev.key === 'Enter' && ev.target && ev.target.tagName !== 'TEXTAREA') {
				ev.preventDefault();
				guardar();
			}
		});

		this.soltarTeclado = attachKeyboardHandling(contentEl, wrap, doc);
		abrirArriba(wrap, primero);
	}

	onClose() {
		if (this.soltarTeclado) { this.soltarTeclado(); this.soltarTeclado = null; }
		if (this.contentEl && this.contentEl.empty) this.contentEl.empty();
		this.cerrarCon(null);
	}
} : null;

/* ============================ plugin ============================ */

class CalDAVBridgePlugin extends Plugin {
	async onload() {
		await this.loadSettings();
		setLanguage(this.settings.language);

		this.api = {
			createEvent: this.createEvent.bind(this),
			updateEvent: this.updateEvent.bind(this),
			deleteEvent: this.deleteEvent.bind(this),
			getEvent: this.getEvent.bind(this),
			testConnection: this.testConnection.bind(this),
			isConfigured: () => this.isConfigured(),
			taskForm: (opciones) => this.taskForm(opciones),
			form: (opciones) => this.form(opciones),
			version: () => this.manifest && this.manifest.version ? this.manifest.version : '',
			defaultAlarmMinutes: () => Number(this.settings.alarmMinutes) || 0,
		};

		this.addSettingTab(new CalDAVBridgeSettingTab(this.app, this));

		this.setupRibbon();

		this.addCommand({
			id: 'open-task-form',
			name: t('cmdTaskForm'),
			callback: async () => {
				const datos = await this.taskForm({
					titulo: t('demoTitle'),
					projects: [{ id: '__demo__', label: t('demoProject') }],
					estados: t('demoStatuses').split('|'),
					prioridades: t('demoPriorities').split('|'),
					duraciones: [30, 60, 90, 120],
				});
				if (!datos) { new Notice(t('demoCancelled')); return; }
				new Notice(t('demoOk'), 9000);
			},
		});

		this.addCommand({
			id: 'run-linked-command',
			name: t('cmdLinked'),
			callback: () => this.runLinkedCommand(),
		});

		this.addCommand({
			id: 'test-connection',
			name: t('cmdTest'),
			callback: async () => {
				const r = await this.testConnection();
				new Notice(r.message, r.ok ? 5000 : 12000);
			},
		});

		this.addCommand({
			id: 'create-test-event',
			name: t('cmdTestEvent'),
			callback: async () => {
				const manana = new Date();
				manana.setDate(manana.getDate() + 1);
				const fecha = `${manana.getFullYear()}-${pad2(manana.getMonth() + 1)}-${pad2(manana.getDate())}`;
				const r = await this.createEvent({
					title: t('testEventTitle'),
					date: fecha, time: '10:00', durationMinutes: 30,
					description: t('testEventDesc'),
				});
				new Notice(r.message, r.ok ? 5000 : 12000);
			},
		});
	}

	/** Adds (or removes) the ribbon icon according to the settings. */
	setupRibbon() {
		if (this.ribbonEl) {
			this.ribbonEl.remove();
			this.ribbonEl = null;
		}
		if (!this.settings.ribbonEnabled) return;
		const icon = String(this.settings.ribbonIcon || 'calendar-plus').trim() || 'calendar-plus';
		const label = String(this.settings.ribbonLabel || 'CalDAV Bridge').trim() || 'CalDAV Bridge';
		try {
			this.ribbonEl = this.addRibbonIcon(icon, label, () => this.runLinkedCommand());
		} catch (e) {
			// If the icon name does not exist, fall back to a safe one.
			this.ribbonEl = this.addRibbonIcon('zap', label, () => this.runLinkedCommand());
		}
	}

	/** Finds a command by its name and runs it. */
	findCommandByName(name) {
		const needle = String(name == null ? '' : name).trim().toLowerCase();
		if (!needle) return null;
		const all = (this.app.commands && this.app.commands.commands) || {};
		const ids = Object.keys(all);
		// 1) exact name match
		for (const id of ids) {
			const n = String((all[id] && all[id].name) || '').toLowerCase();
			if (n === needle) return id;
		}
		// 2) names usually arrive as "QuickAdd: <command name>"
		for (const id of ids) {
			const n = String((all[id] && all[id].name) || '').toLowerCase();
			if (n.endsWith(': ' + needle)) return id;
		}
		// 3) name contains it
		for (const id of ids) {
			const n = String((all[id] && all[id].name) || '').toLowerCase();
			if (n.includes(needle)) return id;
		}
		return null;
	}

	runLinkedCommand() {
		const name = this.settings.ribbonCommandName;
		const id = this.findCommandByName(name);
		if (!id) {
			new Notice(t('linkedNotFound', { name }), 12000);
			return false;
		}
		this.app.commands.executeCommandById(id);
		return true;
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	isConfigured() {
		return Boolean(
			normalizeCollectionUrl(this.settings.url) &&
			String(this.settings.username || '').trim() &&
			String(this.settings.password || '')
		);
	}

	authHeader() {
		const user = String(this.settings.username || '').trim();
		const pass = String(this.settings.password || '');
		return 'Basic ' + base64UTF8(`${user}:${pass}`);
	}

	eventUrl(uid) {
		return normalizeCollectionUrl(this.settings.url) + resourceNameFromUID(uid) + '.ics';
	}

	async testConnection() {
		if (!this.isConfigured()) {
			return { ok: false, status: 0, message: t('notConfiguredSettings') };
		}
		const url = normalizeCollectionUrl(this.settings.url);
		const body =
			'<?xml version="1.0" encoding="utf-8" ?>\r\n' +
			'<D:propfind xmlns:D="DAV:"><D:prop><D:resourcetype/><D:displayname/></D:prop></D:propfind>';
		let res;
		try {
			res = await requestUrl({
				url, method: 'PROPFIND',
				headers: { Authorization: this.authHeader(), 'Content-Type': 'application/xml; charset=utf-8', Depth: '0' },
				body, throw: false,
			});
		} catch (e) {
			return { ok: false, status: 0, message: t('noReach', { error: (e && e.message ? e.message : String(e)) }) };
		}
		if (res.status === 207 || res.status === 200) {
			return { ok: true, status: res.status, message: t('connectionOk') };
		}
		return { ok: false, status: res.status, message: describeStatus(res.status, 'ctxTestConnection') };
	}

	/** Validates the common fields and returns the .ics, or an error. */
	prepare(event, uid, sequence) {
		if (!event || typeof event !== 'object') {
			return { error: { ok: false, status: 0, message: t('noEventData') } };
		}
		if (!this.isConfigured()) {
			return { error: { ok: false, status: 0, message: t('notConfigured') } };
		}
		const title = String(event.title == null ? '' : event.title).trim();
		if (!title) {
			return { error: { ok: false, status: 0, message: t('eventNeedsTitle') } };
		}
		if (event.allDay === true) {
			// All day: date only. Time and duration are ignored if present.
			const dia = parseLocalDateTime(event.date, '');
			if (!dia) {
				return { error: { ok: false, status: 0, message: t('badDate', { date: event.date }) } };
			}
			// For an all-day event DTEND is exclusive: the next day.
			const siguiente = addDays(dia, 1);

			// Absolute reminder. 09:00 of that same day by default.
			let alarmStamp = '';
			const sinAviso = (Number(event.alarmMinutes) === 0) || event.alarmTime === '' || event.alarmTime === null;
			if (!sinAviso) {
				const hora = (event.alarmTime === undefined) ? '09:00' : String(event.alarmTime);
				const momento = parseLocalDateTime(event.date, hora);
				if (!momento) {
					return { error: { ok: false, status: 0, message: t('badAlarmTime', { time: event.alarmTime }) } };
				}
				alarmStamp = toICSStampUTC(momento);
			}

			return {
				ics: buildICS({
					uid,
					dtstamp: toICSStampUTC(new Date()),
					dtstart: icsDateOnly(dia),
					dtend: icsDateOnly(siguiente),
					allDay: true,
					title,
					description: event.description,
					location: event.location,
					alarmStamp,
					sequence,
				})
			};
		}

		const start = parseLocalDateTime(event.date, event.time);
		if (!start) {
			return { error: { ok: false, status: 0, message: t('badDateTime', { date: event.date, time: event.time }) } };
		}
		let minutes = Number(event.durationMinutes);
		if (!Number.isFinite(minutes) || minutes <= 0) minutes = 60;
		minutes = Math.round(minutes);
		const end = new Date(start.getTime() + minutes * 60000);

		let alarm = event.alarmMinutes;
		if (alarm === undefined || alarm === null) alarm = Number(this.settings.alarmMinutes);
		alarm = Number(alarm);
		if (!Number.isFinite(alarm) || alarm <= 0) alarm = 0;

		const ics = buildICS({
			uid,
			dtstamp: toICSStampUTC(new Date()),
			dtstart: toICSStampUTC(start),
			dtend: toICSStampUTC(end),
			title,
			description: event.description,
			location: event.location,
			alarmMinutes: alarm,
			sequence,
		});
		return { ics };
	}

	async putEvent(uid, ics, isNew) {
		const headers = {
			Authorization: this.authHeader(),
			'Content-Type': 'text/calendar; charset=utf-8',
		};
		if (isNew) headers['If-None-Match'] = '*';
		return requestUrl({ url: this.eventUrl(uid), method: 'PUT', headers, body: ics, throw: false });
	}

	/** Opens a generic dialog. Resolves with the data, or with null. */
	form(opciones) {
		return new Promise((resolve) => {
			if (!GenericFormModal) {
				new Notice(t('noModals'));
				resolve(null);
				return;
			}
			try {
				new GenericFormModal(this.app, opciones, resolve).open();
			} catch (e) {
				new Notice(t('formOpenFailed', { error: (e && e.message ? e.message : String(e)) }));
				resolve(null);
			}
		});
	}

	/** Opens the task dialog. Resolves with the data, or with null. */
	taskForm(opciones) {
		return new Promise((resolve) => {
			if (!TaskFormModal) {
				new Notice(t('noModals'));
				resolve(null);
				return;
			}
			try {
				new TaskFormModal(this.app, opciones, resolve).open();
			} catch (e) {
				new Notice(t('formOpenFailed', { error: (e && e.message ? e.message : String(e)) }));
				resolve(null);
			}
		});
	}

	async createEvent(event) {
		try {
			const uid = generateUID();
			const prep = this.prepare(event, uid, 0);
			if (prep.error) return prep.error;

			let res;
			try {
				res = await this.putEvent(uid, prep.ics, true);
			} catch (e) {
				return { ok: false, status: 0, message: t('noReach', { error: (e && e.message ? e.message : String(e)) }) };
			}

			if (res.status === 201 || res.status === 204 || res.status === 200) {
				if (this.settings.notifyOnSuccess) new Notice(t('eventCreatedShort'));
				return { ok: true, status: res.status, message: t('eventCreated'), uid, url: this.eventUrl(uid) };
			}
			return { ok: false, status: res.status, message: describeStatus(res.status, 'ctxCreateEvent'), uid, url: this.eventUrl(uid) };
		} catch (e) {
			return { ok: false, status: 0, message: t('unexpected', { error: (e && e.message ? e.message : String(e)) }) };
		}
	}

	async updateEvent(uid, event) {
		try {
			if (!uid) return { ok: false, status: 0, message: t('missingUid') };
			const seq = Number.isFinite(Number(event && event.sequence)) ? Number(event.sequence) : Math.floor(Date.now() / 1000);
			const prep = this.prepare(event, uid, seq);
			if (prep.error) return prep.error;

			let res;
			try {
				res = await this.putEvent(uid, prep.ics, false);
			} catch (e) {
				return { ok: false, status: 0, message: t('noReach', { error: (e && e.message ? e.message : String(e)) }) };
			}

			if (res.status === 201 || res.status === 204 || res.status === 200) {
				if (this.settings.notifyOnSuccess) new Notice(t('eventUpdatedShort'));
				return { ok: true, status: res.status, message: t('eventUpdated'), uid, url: this.eventUrl(uid) };
			}
			return { ok: false, status: res.status, message: describeStatus(res.status, 'ctxUpdateEvent'), uid, url: this.eventUrl(uid) };
		} catch (e) {
			return { ok: false, status: 0, message: t('unexpected', { error: (e && e.message ? e.message : String(e)) }) };
		}
	}

	/**
	 * Reads an event from the server by its UID.
	 * Returns { ok, status, message, uid, event } where event carries
	 * { title, date, time, durationMinutes, description, location, sequence }.
	 * Never throws.
	 */
	async getEvent(uid) {
		try {
			if (!uid) return { ok: false, status: 0, message: t('missingUid') };
			if (!this.isConfigured()) {
				return { ok: false, status: 0, message: t('notConfigured') };
			}

			let res;
			try {
				res = await requestUrl({
					url: this.eventUrl(uid), method: 'GET',
					headers: { Authorization: this.authHeader(), Accept: 'text/calendar' },
					throw: false,
				});
			} catch (e) {
				return { ok: false, status: 0, message: t('noReach', { error: (e && e.message ? e.message : String(e)) }) };
			}

			if (res.status === 404) {
				return { ok: false, status: 404, notFound: true, message: t('eventNotFound'), uid };
			}
			if (res.status !== 200) {
				return { ok: false, status: res.status, message: describeStatus(res.status, 'ctxReadEvent'), uid };
			}

			const cuerpo = typeof res.text === 'string' ? res.text : String(res.text || '');
			const evento = parseICSEvent(cuerpo);
			if (!evento) {
				return { ok: false, status: res.status, message: t('eventUnreadable'), uid };
			}

			return { ok: true, status: res.status, message: t('eventRead'), uid, event: evento };
		} catch (e) {
			return { ok: false, status: 0, message: t('unexpected', { error: (e && e.message ? e.message : String(e)) }) };
		}
	}

	async deleteEvent(uid) {
		try {
			if (!uid) return { ok: false, status: 0, message: t('missingUid') };
			if (!this.isConfigured()) {
				return { ok: false, status: 0, message: t('notConfigured') };
			}

			let res;
			try {
				res = await requestUrl({
					url: this.eventUrl(uid), method: 'DELETE',
					headers: { Authorization: this.authHeader() }, throw: false,
				});
			} catch (e) {
				return { ok: false, status: 0, message: t('noReach', { error: (e && e.message ? e.message : String(e)) }) };
			}

			if (res.status === 204 || res.status === 200) {
				if (this.settings.notifyOnSuccess) new Notice(t('eventDeletedShort'));
				return { ok: true, status: res.status, message: t('eventDeleted'), uid };
			}
			// If it is already gone, the goal is met anyway.
			if (res.status === 404) {
				return { ok: true, status: 404, message: t('eventAlreadyGone'), uid };
			}
			return { ok: false, status: res.status, message: describeStatus(res.status, 'ctxDeleteEvent'), uid };
		} catch (e) {
			return { ok: false, status: 0, message: t('unexpected', { error: (e && e.message ? e.message : String(e)) }) };
		}
	}
}

/* ============================ settings ============================ */

class CalDAVBridgeSettingTab extends PluginSettingTab {
	constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }

	display() {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t('setUrl'))
			.setDesc(t('setUrlDesc'))
			.addText((c) => c.setPlaceholder('https://...').setValue(this.plugin.settings.url)
				.onChange(async (v) => { this.plugin.settings.url = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('setUser'))
			.setDesc(t('setUserDesc'))
			.addText((c) => c.setPlaceholder('username').setValue(this.plugin.settings.username)
				.onChange(async (v) => { this.plugin.settings.username = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('setPassword'))
			.setDesc(t('setPasswordDesc'))
			.addText((c) => {
				c.setPlaceholder('password').setValue(this.plugin.settings.password)
					.onChange(async (v) => { this.plugin.settings.password = v; await this.plugin.saveSettings(); });
				c.inputEl.type = 'password';
				return c;
			});

		new Setting(containerEl)
			.setName(t('setAlarm'))
			.setDesc(t('setAlarmDesc'))
			.addText((c) => c.setPlaceholder('15').setValue(String(this.plugin.settings.alarmMinutes))
				.onChange(async (v) => {
					const n = Number(String(v).trim());
					this.plugin.settings.alarmMinutes = Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('setNotify'))
			.setDesc(t('setNotifyDesc'))
			.addToggle((tg) => tg.setValue(this.plugin.settings.notifyOnSuccess)
				.onChange(async (v) => { this.plugin.settings.notifyOnSuccess = v; await this.plugin.saveSettings(); }));

		new Setting(containerEl)
			.setName(t('setLanguage'))
			.setDesc(t('setLanguageDesc'))
			.addDropdown((d) => d
				.addOption('auto', t('langAuto'))
				.addOption('en', 'English')
				.addOption('es', 'Castellano')
				.setValue(this.plugin.settings.language || 'auto')
				.onChange(async (v) => {
					this.plugin.settings.language = v;
					await this.plugin.saveSettings();
					setLanguage(v);
					this.display();
				}));

		new Setting(containerEl).setName(t('setShortcut')).setHeading();

		new Setting(containerEl)
			.setName(t('setRibbon'))
			.setDesc(t('setRibbonDesc'))
			.addToggle((tg) => tg.setValue(this.plugin.settings.ribbonEnabled)
				.onChange(async (v) => {
					this.plugin.settings.ribbonEnabled = v;
					await this.plugin.saveSettings();
					this.plugin.setupRibbon();
				}));

		new Setting(containerEl)
			.setName(t('setRibbonCommand'))
			.setDesc(t('setRibbonCommandDesc'))
			.addText((c) => c.setValue(this.plugin.settings.ribbonCommandName)
				.onChange(async (v) => {
					this.plugin.settings.ribbonCommandName = v;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(t('setRibbonLabel'))
			.setDesc(t('setRibbonLabelDesc'))
			.addText((c) => c.setPlaceholder('CalDAV Bridge').setValue(this.plugin.settings.ribbonLabel)
				.onChange(async (v) => {
					this.plugin.settings.ribbonLabel = v;
					await this.plugin.saveSettings();
					this.plugin.setupRibbon();
				}));

		new Setting(containerEl)
			.setName(t('setCheck'))
			.setDesc(t('setCheckDesc'))
			.addButton((b) => b.setButtonText(t('btnCheck')).onClick(() => {
				const id = this.plugin.findCommandByName(this.plugin.settings.ribbonCommandName);
				new Notice(id ? t('cmdFound', { id }) : t('cmdNotFound'), id ? 5000 : 12000);
			}));

		new Setting(containerEl).setName(t('setConnection')).setHeading();

		new Setting(containerEl)
			.setName(t('setTest'))
			.setDesc(t('setTestDesc'))
			.addButton((b) => b.setButtonText(t('btnTest')).onClick(async () => {
				b.setDisabled(true);
				const r = await this.plugin.testConnection();
				b.setDisabled(false);
				new Notice(r.message, r.ok ? 5000 : 12000);
			}));
	}
}

module.exports = CalDAVBridgePlugin;

module.exports._internals = {
	pad2, toICSStampUTC, parseLocalDateTime, escapeICSText, foldICSLine,
	generateUID, resourceNameFromUID, base64UTF8, normalizeCollectionUrl, buildICS, describeStatus,
	icsDateOnly, addDays,
	unfoldICS, unescapeICSText, parseICSStamp, parseICSEvent,
	validateTaskForm, hoyISO, TaskFormModal,
	validateForm, parseImporteForm, GenericFormModal, VALOR_NUEVA,
	attachKeyboardHandling,
	t, setLanguage, detectLanguage, STRINGS,
};
