'use strict';

/**
 * Generates the Legmon content-type schema files (Strapi v5) to match the
 * frontend's data contract (see the website repo's STRAPI_SCHEMA.md).
 *
 * For each collection type it writes:
 *   src/api/<singular>/content-types/<singular>/schema.json
 *   src/api/<singular>/routes/<singular>.js
 *   src/api/<singular>/controllers/<singular>.js
 *   src/api/<singular>/services/<singular>.js
 * plus the shared `faq.item` component, and removes the obsolete
 * page-based types/components that the frontend does not use.
 *
 * Run:  node scripts/generate-content-types.js
 * Then: git add -A && git commit && git push  → Strapi Cloud redeploys.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const API_DIR = path.join(ROOT, 'src', 'api');
const COMPONENTS_DIR = path.join(ROOT, 'src', 'components');

// ---- attribute helpers -----------------------------------------------------
const string = () => ({ type: 'string' });
const text = () => ({ type: 'text' });
const richtext = () => ({ type: 'richtext' });
const integer = () => ({ type: 'integer' });
const decimal = () => ({ type: 'decimal' });
const boolean = () => ({ type: 'boolean' });
const date = () => ({ type: 'date' });
const media = () => ({ type: 'media', multiple: false, allowedTypes: ['images'] });
const enumeration = (...values) => ({ type: 'enumeration', enum: values });
const relOne = (target) => ({ type: 'relation', relation: 'oneToOne', target: `api::${target}.${target}` });
const relMany = (target) => ({ type: 'relation', relation: 'oneToMany', target: `api::${target}.${target}` });
const component = (name, repeatable = false) => ({ type: 'component', repeatable, component: name });
const order = () => ({ type: 'integer' });

// ---- the full target model -------------------------------------------------
// singular => attributes. Plural endpoints are derived (with explicit overrides
// for irregular plurals) so they match the frontend's getCollection() calls.
const PLURALS = {
	logo: 'logos',
	mentor: 'mentors',
	'mentoring-topic': 'mentoring-topics',
	testimonial: 'testimonials',
	'social-channel': 'social-channels',
	'impact-metric': 'impact-metrics',
	'event-category': 'event-categories',
	event: 'events',
	'blog-category': 'blog-categories',
	'blog-post': 'blog-posts',
	'faq-topic': 'faq-topics',
	'mentoring-step': 'mentoring-steps',
	'experience-topic': 'experience-topics',
	'mentoring-experience': 'mentoring-experiences',
	'timeline-milestone': 'timeline-milestones',
	'about-fact': 'about-facts',
	'partner-option': 'partner-options',
	'company-visit': 'company-visits',
	'school-benefit': 'school-benefits',
	workshop: 'workshops',
	'school-visit': 'school-visits',
	'school-visit-step': 'school-visit-steps',
	'ambassador-benefit': 'ambassador-benefits',
	'ambassador-step': 'ambassador-steps',
	'ambassador-requirement': 'ambassador-requirements',
	'community-value': 'community-values',
	'member-preview': 'member-previews',
	'success-story': 'success-stories',
	'member-story': 'member-stories',
	'engagement-highlight': 'engagement-highlights',
	'engagement-area': 'engagement-areas',
	'engagement-quality': 'engagement-qualities',
	'application-step': 'application-steps',
	'content-topic': 'content-topics',
	'content-video': 'content-videos',
	'registration-type': 'registration-types',
	'signup-step': 'signup-steps'
};

const MODEL = {
	// --- shared collections ---
	logo: { name: string(), image: media(), url: string(), category: enumeration('press', 'sponsor', 'partner', 'donor'), order: order() },
	mentor: { name: string(), title: string(), description: text(), topics: relMany('mentoring-topic'), photo: media(), featured: boolean(), order: order() },
	'mentoring-topic': { name: string(), order: order() },
	testimonial: { quote: text(), name: string(), role: string(), photo: media(), placement: enumeration('homepage', 'impact', 'wirkung', 'community'), order: order() },
	'social-channel': { name: string(), iconType: enumeration('youtube', 'instagram', 'tiktok', 'spotify', 'linkedin', 'discord'), href: string(), order: order() },
	'impact-metric': { page: enumeration('home', 'impact', 'wirkung'), slug: string(), label: string(), value: decimal(), prefix: string(), suffix: string(), decimals: integer(), icon: string(), order: order() },

	// --- events ---
	'event-category': { slug: string(), label: string(), mobileLabel: string(), icon: string(), heading: string(), description: text(), order: order() },
	event: { title: string(), date: date(), endDate: date(), time: string(), location: string(), memberOnly: boolean(), category: relOne('event-category'), imageMode: enumeration('background', 'inline'), image: media(), description: text(), link: string(), order: order() },

	// --- blog / faq ---
	'blog-category': { name: string(), order: order() },
	'blog-post': { date: string(), category: relOne('blog-category'), title: string(), description: text(), body: richtext(), coverImage: media(), readTime: string(), link: string(), order: order() },
	'faq-topic': { title: string(), subtitle: string(), items: component('faq.item', true), order: order() },

	// --- mentoring ---
	'mentoring-step': { step: string(), title: string(), description: text(), order: order() },
	'experience-topic': { name: string(), order: order() },
	'mentoring-experience': { topic: relOne('experience-topic'), title: string(), name: string(), role: string(), quote: text(), order: order() },

	// --- about ---
	'timeline-milestone': { year: string(), title: string(), description: text(), order: order() },
	'about-fact': { title: string(), text: text(), order: order() },

	// --- partners (companies / schools / universities) ---
	'partner-option': { icon: string(), title: string(), subtitle: string(), description: text(), order: order() },
	'company-visit': { company: string(), activity: string(), impact: string(), quote: text(), hr: string(), logo: media(), photo: media(), order: order() },
	'school-benefit': { icon: string(), title: string(), text: text(), order: order() },
	workshop: { title: string(), description: text(), dauer: string(), stufe: string(), order: order() },
	'school-visit': { school: string(), activity: string(), quote: text(), teacher: string(), logo: media(), photo: media(), order: order() },
	'school-visit-step': { num: integer(), title: string(), text: text(), order: order() },

	// --- creator / community ---
	'ambassador-benefit': { icon: string(), title: string(), description: text(), order: order() },
	'ambassador-step': { step: string(), title: string(), description: text(), order: order() },
	'ambassador-requirement': { requirement: string(), order: order() },
	'community-value': { icon: string(), title: string(), text: text(), order: order() },
	'member-preview': { name: string(), role: string(), quote: text(), type: enumeration('video', 'photo'), media: media(), order: order() },

	// --- impact / wirkung ---
	'success-story': { name: string(), title: string(), description: text(), type: enumeration('text', 'video'), photo: media(), videoUrl: string(), order: order() },
	'member-story': { name: string(), title: string(), description: text(), order: order() },

	// --- engagement ---
	'engagement-highlight': { icon: string(), title: string(), text: text(), image: media(), order: order() },
	'engagement-area': { icon: string(), title: string(), tagline: string(), description: richtext(), email: string(), order: order() },
	'engagement-quality': { icon: string(), title: string(), text: text(), order: order() },
	'application-step': { icon: string(), title: string(), text: text(), order: order() },

	// --- content / signup ---
	'content-topic': { slug: string(), label: string(), icon: string(), headline: string(), description: text(), order: order() },
	'content-video': { title: string(), topic: relOne('content-topic'), length: string(), description: text(), order: order() },
	'registration-type': { slug: string(), label: string(), icon: string(), description: text(), order: order() },
	'signup-step': { step: string(), title: string(), description: text(), order: order() }
};

// Obsolete page-based types + the `general` collection (frontend never reads them).
const OBSOLETE_API = [
	'about', 'global', 'general',
	'homepage', 'events-page', 'community-page', 'mentoring-page', 'wirkung-page',
	'story', 'faq'
];

// ---- generators ------------------------------------------------------------
const titleCase = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
const factory = (singular, fn) =>
	`'use strict';\n\n/**\n * ${singular} ${fn === 'createCoreRouter' ? 'router' : fn === 'createCoreController' ? 'controller' : 'service'}\n */\n\nconst { ${fn} } = require('@strapi/strapi').factories;\n\nmodule.exports = ${fn}('api::${singular}.${singular}');\n`;

function writeFile(file, contents) {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, contents);
}

function generateType(singular, attributes) {
	const plural = PLURALS[singular];
	if (!plural) throw new Error(`Missing plural for "${singular}"`);
	const schema = {
		kind: 'collectionType',
		collectionName: plural.replace(/-/g, '_'),
		info: { singularName: singular, pluralName: plural, displayName: titleCase(singular) },
		options: { draftAndPublish: true },
		pluginOptions: {},
		attributes
	};
	const base = path.join(API_DIR, singular);
	writeFile(path.join(base, 'content-types', singular, 'schema.json'), JSON.stringify(schema, null, 2) + '\n');
	writeFile(path.join(base, 'routes', `${singular}.js`), factory(singular, 'createCoreRouter'));
	writeFile(path.join(base, 'controllers', `${singular}.js`), factory(singular, 'createCoreController'));
	writeFile(path.join(base, 'services', `${singular}.js`), factory(singular, 'createCoreService'));
}

// ---- run -------------------------------------------------------------------
let created = 0;
for (const [singular, attributes] of Object.entries(MODEL)) {
	generateType(singular, attributes);
	created++;
}

// faq.item component (repeatable inside faq-topic)
writeFile(
	path.join(COMPONENTS_DIR, 'faq', 'item.json'),
	JSON.stringify(
		{
			collectionName: 'components_faq_items',
			info: { displayName: 'Item', icon: 'question' },
			options: {},
			attributes: { question: { type: 'string' }, answer: { type: 'text' } }
		},
		null,
		2
	) + '\n'
);

// Remove obsolete API folders.
let removed = 0;
for (const name of OBSOLETE_API) {
	const dir = path.join(API_DIR, name);
	if (fs.existsSync(dir)) {
		fs.rmSync(dir, { recursive: true, force: true });
		removed++;
	}
}

// Remove the obsolete page-model components (keep only the new faq component).
const sharedComponents = path.join(COMPONENTS_DIR, 'shared');
if (fs.existsSync(sharedComponents)) {
	fs.rmSync(sharedComponents, { recursive: true, force: true });
}

console.log(`Generated ${created} collection types + faq.item component.`);
console.log(`Removed ${removed} obsolete API folders and the shared/* components.`);
