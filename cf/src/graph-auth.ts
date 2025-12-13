/**
 * Microsoft Graph API OAuth 2.0 Authentication Helpers
 * 
 * This module handles Azure AD authentication and token management
 * for Microsoft Graph API access.
 */

import { getFromStorage, setInStorage, deleteFromStorage } from './storage';

export const KV_TOKEN_KEY = 'ms_graph_tokens';

export interface TokenData {
	access_token: string;
	refresh_token: string;
	expires_at: number; // Unix timestamp in milliseconds
	scope: string;
}

export interface TokenResponse {
	access_token: string;
	refresh_token: string;
	expires_in: number;
	scope: string;
	token_type: string;
}

/**
 * Environment interface with Azure AD credentials
 */
export interface EnvWithAzure extends Env {
	AZURE_TENANT_ID: string;
	AZURE_CLIENT_ID: string;
	AZURE_CLIENT_SECRET: string;
	AZURE_REDIRECT_URI: string;
	REFRESH_KEY: string;
	MISSKEY_BASE_URL: string;
	MISSKEY_ACCESS_TOKEN: string;
}

/**
 * Build the Azure AD authorization URL
 */
export function buildAuthUrl(env: EnvWithAzure, state: string): string {
	const params = new URLSearchParams({
		client_id: env.AZURE_CLIENT_ID,
		response_type: 'code',
		redirect_uri: env.AZURE_REDIRECT_URI,
		response_mode: 'query',
		scope: 'offline_access User.Read Files.Read Files.Read.All',
		state: state,
		prompt: 'consent', // Force consent to ensure we get refresh_token
	});
	return `https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?${params}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(env: EnvWithAzure, code: string): Promise<TokenResponse> {
	const tokenUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/token`;
	
	const body = new URLSearchParams({
		client_id: env.AZURE_CLIENT_ID,
		client_secret: env.AZURE_CLIENT_SECRET,
		code: code,
		redirect_uri: env.AZURE_REDIRECT_URI,
		grant_type: 'authorization_code',
	});

	const response = await fetch(tokenUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: body.toString(),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Token exchange failed: ${error}`);
	}

	return response.json();
}

/**
 * Refresh the access token using the refresh token
 */
export async function refreshAccessToken(env: EnvWithAzure, refreshToken: string): Promise<TokenResponse> {
	const tokenUrl = `https://login.microsoftonline.com/consumers/oauth2/v2.0/token`;
	
	const body = new URLSearchParams({
		client_id: env.AZURE_CLIENT_ID,
		client_secret: env.AZURE_CLIENT_SECRET,
		refresh_token: refreshToken,
		grant_type: 'refresh_token',
	});

	const response = await fetch(tokenUrl, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
		},
		body: body.toString(),
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Token refresh failed: ${error}`);
	}

	return response.json();
}

/**
 * Store tokens in storage
 */
export function storeTokens(env: EnvWithAzure, tokenResponse: TokenResponse): void {
	const tokenData: TokenData = {
		access_token: tokenResponse.access_token,
		refresh_token: tokenResponse.refresh_token,
		expires_at: Date.now() + tokenResponse.expires_in * 1000,
		scope: tokenResponse.scope,
	};
	setInStorage(env, KV_TOKEN_KEY, tokenData);
}

/**
 * Get a valid access token, refreshing if necessary
 */
export async function getValidAccessToken(env: EnvWithAzure): Promise<string | null> {
	const tokenData = await getFromStorage(env, KV_TOKEN_KEY);
	if (!tokenData) {
		return null;
	}
	
	// Check if token is expired or will expire in the next 5 minutes
	const bufferMs = 5 * 60 * 1000;
	if (Date.now() + bufferMs >= tokenData.expires_at) {
		// Token is expired or about to expire, refresh it
		try {
			const newTokens = await refreshAccessToken(env, tokenData.refresh_token);
			storeTokens(env, newTokens);
			return newTokens.access_token;
		} catch (error) {
			console.error('Failed to refresh token:', error);
			// Clear invalid tokens
			deleteFromStorage(env, KV_TOKEN_KEY);
			return null;
		}
	}

	return tokenData.access_token;
}

/**
 * Clear stored tokens
 */
export function clearTokens(env: EnvWithAzure): void {
	deleteFromStorage(env, KV_TOKEN_KEY);
}

/**
 * Make an authenticated request to Microsoft Graph API
 */
export async function callGraphApi(
	env: EnvWithAzure,
	endpoint: string,
	options: RequestInit = {}
): Promise<Response> {
	const accessToken = await getValidAccessToken(env);
	if (!accessToken) {
		throw new Error('No valid access token available. Please sign in first.');
	}

	const url = endpoint.startsWith('https://') 
		? endpoint 
		: `https://graph.microsoft.com/v1.0${endpoint}`;

	return fetch(url, {
		...options,
		headers: {
			...options.headers,
			Authorization: `Bearer ${accessToken}`,
		},
	});
}

/**
 * Generate a random state parameter for CSRF protection
 */
export function generateState(): string {
	const array = new Uint8Array(16);
	crypto.getRandomValues(array);
	return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Store auth state in KV for CSRF validation
 */
export async function storeAuthState(env: EnvWithAzure, state: string): Promise<void> {
	await env.STORAGE.put(`auth_state:${state}`, '1', { expirationTtl: 600 });
}

/**
 * Validate and consume auth state
 */
export async function validateAndConsumeAuthState(env: EnvWithAzure, state: string): Promise<boolean> {
	const storedState = await env.STORAGE.get(`auth_state:${state}`);
	if (!storedState) {
		return false;
	}
	await env.STORAGE.delete(`auth_state:${state}`);
	return true;
}
