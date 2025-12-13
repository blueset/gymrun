/**
 * Authentication Routes for Microsoft Graph API
 */

import {
	EnvWithAzure,
	buildAuthUrl,
	exchangeCodeForTokens,
	storeTokens,
	getValidAccessToken,
	// clearTokens,
	callGraphApi,
	generateState,
	storeAuthState,
	validateAndConsumeAuthState,
} from './graph-auth';

// HTML template for login form
const LOGIN_FORM_HTML = `
<form method="POST" action="">
	<label for="password">Password:</label>
	<input type="password" id="password" name="password" required autofocus>
	<button type="submit">Sign In</button>
</form>
{{ERROR}}`;

/**
 * Handle authentication routes under /auth/*
 * Returns a Response if the route was handled, null otherwise
 */
export async function handleAuthRoutes(
	request: Request,
	env: EnvWithAzure,
	path: string,
	url: URL
): Promise<Response | null> {
	const method = request.method;

	// GET /auth/login → Show login form
	if (method === 'GET' && path === '/auth/login') {
		const html = LOGIN_FORM_HTML.replace('{{ERROR}}', '');
		return new Response(html, {
			headers: { 'Content-Type': 'text/html' },
		});
	}

	// POST /auth/login → Validate password and redirect to Azure AD
	if (method === 'POST' && path === '/auth/login') {
		const contentType = request.headers.get('Content-Type') || '';
		let password = '';

		if (contentType.includes('application/x-www-form-urlencoded')) {
			const formData = await request.formData();
			password = formData.get('password')?.toString() || '';
		} else if (contentType.includes('application/json')) {
			const body = await request.json<{ password?: string }>();
			password = body.password || '';
		}

		// Validate password against AZURE_CLIENT_SECRET
		if (password !== env.AZURE_CLIENT_SECRET) {
			const html = LOGIN_FORM_HTML.replace('{{ERROR}}', '<p>Invalid password</p>');
			return new Response(html, {
				status: 401,
				headers: { 'Content-Type': 'text/html' },
			});
		}

		// Password is correct, proceed with OAuth flow
		const state = generateState();
		await storeAuthState(env, state);
		
		const authUrl = buildAuthUrl(env, state);
		console.log('Redirecting to auth URL:', authUrl);
		return Response.redirect(authUrl, 302);
	}

	// GET /auth/callback → Handle OAuth callback
	if (method === 'GET' && path === '/auth/callback') {
		const code = url.searchParams.get('code');
		const state = url.searchParams.get('state');
		const error = url.searchParams.get('error');
		const errorDescription = url.searchParams.get('error_description');

		if (error) {
			return new Response(
				`<h1>Authentication Error</h1><p>${error}: ${errorDescription}</p>`,
				{ status: 400, headers: { 'Content-Type': 'text/html' } }
			);
		}

		if (!code || !state) {
			return new Response(
				'<h1>Error</h1><p>Missing code or state parameter</p>',
				{ status: 400, headers: { 'Content-Type': 'text/html' } }
			);
		}

		// Validate state for CSRF protection
		const isValidState = await validateAndConsumeAuthState(env, state);
		if (!isValidState) {
			return new Response(
				'<h1>Error</h1><p>Invalid or expired state parameter</p>',
				{ status: 400, headers: { 'Content-Type': 'text/html' } }
			);
		}

		try {
			const tokens = await exchangeCodeForTokens(env, code);
			await storeTokens(env, tokens);
			
			return new Response(
				'<h1>Success!</h1><p>You are now signed in. You can close this window.</p>',
				{ headers: { 'Content-Type': 'text/html' } }
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Unknown error';
			return new Response(
				`<h1>Error</h1><p>Failed to exchange code for tokens: ${message}</p>`,
				{ status: 500, headers: { 'Content-Type': 'text/html' } }
			);
		}
	}

	// GET /auth/status → Check authentication status
	if (method === 'GET' && path === '/auth/status') {
		const accessToken = await getValidAccessToken(env);
		if (accessToken) {
			// Fetch user info to show who is signed in
			try {
				const userResponse = await callGraphApi(env, '/me');
				if (userResponse.ok) {
					// const user = await userResponse.json() as { displayName?: string; mail?: string; userPrincipalName?: string };
					return new Response(JSON.stringify({
						authenticated: true,
						// user: {
						// 	displayName: user.displayName,
						// 	email: user.mail || user.userPrincipalName,
						// }
					}), {
						headers: { 'Content-Type': 'application/json' },
					});
				}
			} catch {
				// Fall through to unauthenticated
			}
		}
		return new Response(JSON.stringify({ authenticated: false }), {
			headers: { 'Content-Type': 'application/json' },
		});
	}

	// GET /auth/logout → Clear stored tokens
	// if (method === 'GET' && path === '/auth/logout') {
	// 	await clearTokens(env);
	// 	return new Response(
	// 		'<h1>Signed Out</h1><p>Your tokens have been cleared.</p>',
	// 		{ headers: { 'Content-Type': 'text/html' } }
	// 	);
	// }

	// Route not handled
	return null;
}
