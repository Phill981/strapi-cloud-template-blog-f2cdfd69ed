'use strict';

/**
 * Seeds the Legmon collections via the Strapi REST API (full-access token).
 *
 * Reads ./seed-data.json (an object keyed by plural apiId -> array of records).
 * Relations are expressed in the data as plain strings (a topic name, a
 * category slug, ...); this script resolves them to documentIds by creating the
 * taxonomy collections first and building lookup maps.
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

async function api(method, urlPath, body) {
	const res = await fetch(`${BASE}/api/${urlPath}`, {
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

async function seedCollection(plural, records) {
	const cleared = await clearCollection(plural);
	let ok = 0;
	const keyField = TAXONOMY_KEY[plural];
	for (const record of records) {
		const payload = resolveRelations(plural, record);
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
