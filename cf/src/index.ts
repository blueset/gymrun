/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import { EnvWithAzure } from './graph-auth';
import { handleAuthRoutes } from './auth-routes';
import { handleOneDriveRoutes } from './onedrive-routes';
import { persistStorage } from './storage';
import { handleRenderRoutes } from './render-routes';
import { registerSubscription } from './onedrive';
import { GymrunUpdateCoordinator } from './update-coordinator';

// ============================================================================
// Main Worker Handler
// ============================================================================

async function handleRequest(request: Request, env: EnvWithAzure, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);
	const method = request.method;
	
	// Add trailing slash redirect for /gymrun
	if (url.pathname === '/gymrun') {
		const redirectUrl = new URL(url);
		redirectUrl.pathname = '/gymrun/';
		return Response.redirect(redirectUrl.toString(), 301);
	}

	// Normalize the path - strip /gymrun prefix if present (production)
	// This allows the same code to work locally (no prefix) and in production (with prefix)
	const path = url.pathname.replace(/^\/gymrun/, '') || '/';

	// GET / → text/html
	if (method === 'GET' && path === '/') {
		return new Response((
			'<p>Units: ' + 
			'<label><input type="radio" id="tab-native" name="unit-tab" checked>Native</label>' + 
			'<label><input type="radio" id="tab-metric" name="unit-tab">Metric</label>' + 
			'<label><input type="radio" id="tab-imperial" name="unit-tab">Imperial</label>' + 
			'</p>' +
			'<p id="native-p"><a href="./card.png" target="_blank"><img src="./card.png" width="1200" height="675" style="max-width: 100%;" alt="Social Card Preview (Native units)" /></a></p>' +
			'<p id="metric-p"><a href="./card.png?unit=kg" target="_blank"><img src="./card.png?unit=kg" width="1200" height="675" style="max-width: 100%;" alt="Social Card Preview (Metric units)" /></a></p>' +
			'<p id="imperial-p"><a href="./card.png?unit=lbs" target="_blank"><img src="./card.png?unit=lbs" width="1200" height="675" style="max-width: 100%;" alt="Social Card Preview (Imperial units)" /></a></p>' +
			'<style>body:not(:has(#tab-native:checked)) #native-p, body:not(:has(#tab-metric:checked)) #metric-p, body:not(:has(#tab-imperial:checked)) #imperial-p { display: none; }</style>' +
			'<p><a href="https://github.com/blueset/gymrun" target="_blank">https://github.com/blueset/gymrun</a></p>'
		), {
			headers: { 'Content-Type': 'text/html' },
		});
	}

	// ====================================================================
	// Authentication Routes (/auth/*)
	// ====================================================================
	if (path.startsWith('/auth/')) {
		const authResponse = await handleAuthRoutes(request, env, path, url);
		if (authResponse) {
			return authResponse;
		}
	}

	if (path.startsWith('/oauth_redir')) {
		const newUrl = new URL(url);
		newUrl.pathname = '/auth/callback';
		return Response.redirect(newUrl.toString(), 302);
	}

	const oneDriveResponse = await handleOneDriveRoutes(request, env, path, url);
	if (oneDriveResponse) {
		return oneDriveResponse;
	}

	const renderResponse = await handleRenderRoutes(request, env, path, url);
	if (renderResponse) {
		return renderResponse;
	}
	
	// 404 for unmatched routes
	return new Response('Not Found', { status: 404 });
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const azureEnv = env as EnvWithAzure;
		try {
			return await handleRequest(request, azureEnv, ctx);
		} finally {
			// Always persist storage changes at the end of the request
			ctx.waitUntil(persistStorage(azureEnv));
		}
	},

	// Scheduled handler for cron jobs
	async scheduled(event, env, ctx): Promise<void> {
		const azureEnv = env as EnvWithAzure;
		try {
			// Renew the OneDrive webhook subscription
			const webhookUrl = 'https://labs.1a23.com/gymrun/webhook';
			const result = await registerSubscription(azureEnv, webhookUrl);
			console.log('Subscription renewed:', result.id, 'expires:', result.expirationDateTime);
		} catch (err) {
			console.error('Failed to renew subscription:', err);
			throw err; // Re-throw to mark the scheduled event as failed
		} finally {
			await persistStorage(azureEnv);
		}
	},
} satisfies ExportedHandler<Env>;

// Export Durable Object class
export { GymrunUpdateCoordinator };
