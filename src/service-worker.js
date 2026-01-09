// Disables access to DOM typings like `HTMLElement` which are not available
// inside a service worker and instantiates the correct globals
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Ensures that the `$service-worker` import has proper type definitions
/// <reference types="@sveltejs/kit" />

// Only necessary if you have an import from `$env/static/public`
/// <reference types="../.svelte-kit/ambient.d.ts" />

import { build, files, version } from '$service-worker';

// This gives `self` the correct types
const self = /** @type {ServiceWorkerGlobalScope} */ (/** @type {unknown} */ (globalThis.self));

const CACHE = `cache-${version}`;
const ASSETS = [
	...build,
	...files, // everything in `static`
];

const mod = {
	
	precache: async () => (await caches.open(CACHE)).addAll(ASSETS),
	
	deleteCache: async () => Promise.all((await caches.keys()).filter(e => e !== CACHE).map(caches.delete)),

	async respond (event) {
		const url = new URL(event.request.url);
		const cache = await caches.open(CACHE);
		let response;

		// always serve `build` and `files` from cache
		if (ASSETS.includes(url.pathname) && (response = await cache.match(url.pathname)))
			return response;

		// try network first, and fall back to cache if offline
		// (but if our whole app makes no requests this will probably never happen)
		try {
			response = await fetch(event.request);

			// sometimes fetch doesn't return a `Response`
			if (!(response instanceof Response)) {
				throw new Error('invalid response from fetch');
			}

			if (response.status === 200) {
				cache.put(event.request, response.clone());
			}

			return response;
		} catch (err) {
			if (response = await cache.match(event.request))
				return response;

			// nothing more can do to respond to this request
			throw err;
		}
	},

	didInstall: event => event.waitUntil(mod.precache()),

	didActivate: event => event.waitUntil(mod.deleteCache()),

	didFetch: event => {
		// ignore POST requests, etc…
		if (event.request.method !== 'GET')
			return;

		event.respondWith(mod.respond(event));
	},

};

self.addEventListener('install', mod.didInstall);

self.addEventListener('activate', mod.didActivate);

self.addEventListener('fetch', mod.didFetch);
