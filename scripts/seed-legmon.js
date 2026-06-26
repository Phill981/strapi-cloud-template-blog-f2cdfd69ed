'use strict';

/**
 * Seeds the Legmon collections via the Strapi REST API (full-access token).
 *
 * Reads ./seed-data.json (an object keyed by plural apiId -> array of records).
 * Relations are expressed in the data as plain strings (a topic name, a
 * category slug, ...); this script resolves them to documentIds by creating the
 * taxonomy collections first and building lookup maps.
 *
 * Media fields (image/photo/coverImage/logo/media) hold either a remote URL
 * (downloaded) or a local path relative to this scripts/ dir (e.g.
 * "assets/foo.webp"). Each is uploaded to Strapi's Upload API and replaced by
 * the returned file id before the record is created. NOTE: clearing a
 * collection does not remove already-uploaded files from the Media Library, so
 * re-running can leave orphaned media there (harmless; tidy up manually).
 *
 * REST POST auto-publishes on this instance, so no separate publish step.
 * Idempotent: each collection is cleared before it is re-seeded.
 *
 * Run (from the backend repo root):
 *   STRAPI_URL=... STRAPI_API_KEY=... node scripts/seed-legmon.js
 */

const fs = require('fs');
const path = require('path');

const BASE = (process.env.STRAPI_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.STRAPI_API_KEY || '';
if (!BASE || !TOKEN) {
	console.error('Set STRAPI_URL and STRAPI_API_KEY env vars.');
	process.exit(1);
}

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed-data.json'), 'utf8'));

const headers = { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' };

// Taxonomies must be created first; map their key field -> documentId.
const TAXONOMY_KEY = {
	'mentoring-topics': 'name',
	'experience-topics': 'name',
	'blog-categories': 'name',
	'event-categories': 'slug',
	'content-topics': 'slug'
};

// collection -> { relationField: { target pluralApiId, many } }
const RELATIONS = {
	mentors: { topics: { target: 'mentoring-topics', many: true } },
	events: { category: { target: 'event-categories', many: false } },
	'blog-posts': { category: { target: 'blog-categories', many: false } },
	'mentoring-experiences': { topic: { target: 'experience-topics', many: false } },
	'content-videos': { topic: { target: 'content-topics', many: false } }
};

const maps = {}; // pluralApiId -> { keyValue: documentId }

// Media fields to upload+link; values are URLs or scripts/-relative local paths.
const MEDIA_FIELDS = ['image', 'photo', 'coverImage', 'logo', 'media'];
const uploadCache = new Map(); // source string -> uploaded file id
const MIME = {
	'.webp': 'image/webp',
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.avif': 'image/avif'
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// fetch with retry/backoff on network errors and 5xx (Strapi Cloud cold-starts
// and brief restarts return 503; transient and worth retrying).
async function fetchRetry(url, opts, tries = 5) {
	let lastErr;
	for (let i = 1; i <= tries; i++) {
		try {
			const res = await fetch(url, opts);
			if (res.status >= 500 && i < tries) {
				await sleep(800 * i);
				continue;
			}
			return res;
		} catch (e) {
			lastErr = e;
			if (i < tries) {
				await sleep(800 * i);
				continue;
			}
			throw e;
		}
	}
	throw lastErr || new Error('fetchRetry exhausted');
}

async function api(method, urlPath, body) {
	const res = await fetchRetry(`${BASE}/api/${urlPath}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`${method} ${urlPath} -> ${res.status}: ${text.slice(0, 300)}`);
	return text ? JSON.parse(text) : null;
}

async function clearCollection(plural) {
	let removed = 0;
	// repeatedly fetch page 1 and delete until empty (handles shifting pagination)
	for (;;) {
		const json = await api('GET', `${plural}?pagination[pageSize]=100&status=draft`);
		const rows = json?.data || [];
		if (!rows.length) break;
		for (const row of rows) {
			await api('DELETE', `${plural}/${row.documentId}`);
			removed++;
		}
	}
	return removed;
}

function resolveRelations(plural, record) {
	const rel = RELATIONS[plural];
	if (!rel) return record;
	const out = { ...record };
	for (const [field, cfg] of Object.entries(rel)) {
		const raw = out[field];
		if (raw == null || raw === '') {
			delete out[field];
			continue;
		}
		const lookup = maps[cfg.target] || {};
		if (cfg.many) {
			const ids = (Array.isArray(raw) ? raw : [raw]).map((v) => lookup[v]).filter(Boolean);
			if (ids.length) out[field] = ids;
			else delete out[field];
		} else {
			const id = lookup[raw];
			if (id) out[field] = id;
			else {
				console.warn(`    ! ${plural}.${field}="${raw}" has no matching ${cfg.target}; left empty`);
				delete out[field];
			}
		}
	}
	return out;
}

// Upload one media source (URL or local path) and return its Strapi file id.
async function uploadMedia(source) {
	if (uploadCache.has(source)) return uploadCache.get(source);
	let bytes, filename, mime;
	if (/^https?:\/\//i.test(source)) {
		const res = await fetchRetry(source, { headers: { 'User-Agent': 'Mozilla/5.0' } });
		if (!res.ok) throw new Error(`download ${res.status} for ${source}`);
		bytes = Buffer.from(await res.arrayBuffer());
		mime = (res.headers.get('content-type') || 'image/jpeg').split(';')[0];
		const clean = source.split('?')[0].split('/').pop() || 'image';
		filename = /\.[a-z0-9]+$/i.test(clean) ? clean : `${clean}.jpg`;
	} else {
		const abs = path.resolve(__dirname, source);
		bytes = fs.readFileSync(abs);
		filename = path.basename(abs);
		mime = MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream';
	}
	const form = new FormData();
	form.append('files', new Blob([bytes], { type: mime }), filename);
	const res = await fetchRetry(`${BASE}/api/upload`, {
		method: 'POST',
		headers: { Authorization: `Bearer ${TOKEN}` },
		body: form
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`upload -> ${res.status}: ${text.slice(0, 200)}`);
	const json = JSON.parse(text);
	const id = Array.isArray(json) ? json[0]?.id : json?.id;
	if (!id) throw new Error(`upload returned no id for ${source}`);
	uploadCache.set(source, id);
	return id;
}

// Replace media-field source strings with uploaded file ids; drop empties.
async function resolveMedia(plural, record) {
	const out = { ...record };
	for (const field of MEDIA_FIELDS) {
		const val = out[field];
		if (typeof val !== 'string' || !val) {
			if (field in out) delete out[field];
			continue;
		}
		try {
			out[field] = await uploadMedia(val);
		} catch (e) {
			console.warn(`    ! ${plural}.${field}: ${e.message}; left empty`);
			delete out[field];
		}
	}
	return out;
}

async function seedCollection(plural, records) {
	const cleared = await clearCollection(plural);
	let ok = 0;
	const keyField = TAXONOMY_KEY[plural];
	for (const record of records) {
		const payload = await resolveMedia(plural, resolveRelations(plural, record));
		try {
			const created = await api('POST', plural, { data: payload });
			ok++;
			if (keyField) {
				maps[plural] = maps[plural] || {};
				maps[plural][record[keyField]] = created.data.documentId;
			}
		} catch (e) {
			console.warn(`    x failed record in ${plural}: ${e.message}`);
		}
	}
	console.log(`  ${plural}: cleared ${cleared}, created ${ok}/${records.length}`);
	return ok;
}

async function main() {
	console.log(`Seeding ${BASE}\n`);
	const allKeys = Object.keys(data);
	const taxonomyKeys = allKeys.filter((k) => TAXONOMY_KEY[k]);
	const restKeys = allKeys.filter((k) => !TAXONOMY_KEY[k]);

	console.log('1) Taxonomies (build relation maps):');
	for (const k of taxonomyKeys) await seedCollection(k, data[k] || []);

	console.log('\n2) Remaining collections:');
	let total = 0;
	for (const k of restKeys) total += await seedCollection(k, data[k] || []);

	console.log(`\nDone. ${allKeys.length} collections processed.`);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
