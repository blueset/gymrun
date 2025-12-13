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

// ============================================================================
// Main Worker Handler
// ============================================================================

async function handleRequest(request: Request, env: EnvWithAzure, ctx: ExecutionContext): Promise<Response> {
	const url = new URL(request.url);
	const method = request.method;
	
	// Normalize the path - strip /gymrun prefix if present (production)
	// This allows the same code to work locally (no prefix) and in production (with prefix)
	const path = url.pathname.replace(/^\/gymrun/, '') || '/';

	// GET / → text/html
	if (method === 'GET' && path === '/') {
		return new Response((
			'<p><a href="./card.png" target="_blank"><img src="./card.png" style="width: 100%;" alt="Social Card Preview" /></a></p>' +
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
} satisfies ExportedHandler<Env>;
