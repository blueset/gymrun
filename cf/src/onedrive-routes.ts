import {
	type EnvWithAzure,
} from './graph-auth';
import { getFromStorage, setInStorage } from './storage';
import { getZip, registerSubscription } from './onedrive';
import { processZip, getMaxTime, type ExerciseGroups } from './gymrun';
import { tootCard } from './toot';

/**
 * Process the GymRun backup file from OneDrive and store the data
 * @param env Environment with Azure credentials and storage
 * @param force Force update even if data hasn't changed
 */
export async function processFile(env: EnvWithAzure, force: boolean = false): Promise<string> {
    const zip = await getZip(env);
    const data: ExerciseGroups = await processZip(zip);

    const newTime = getMaxTime(data);
    const lastTime = await getFromStorage(env, 'lastUpdated') || 0;
    if (force || newTime > lastTime) {
        setInStorage(env, 'lastUpdated', newTime);
        setInStorage(env, 'data', data);
    }

    return await tootCard(data, newTime, env);
}

export async function handleOneDriveRoutes(
    request: Request,
    env: EnvWithAzure,
    path: string,
    url: URL
): Promise<Response | null> {
    const method = request.method;
    
    // POST /webhook → text/plain
    if (method === 'POST' && path === '/webhook') {
        
        const contentType = request.headers.get('Content-Type') || '';
        if (contentType.includes('application/json')) {
            const body = await request.json<{ value?: string }>();
            if (body.value) {
                try {
                    await processFile(env);
                } catch (err) {
                    console.error('Error processing file:', err);
                }
            }
        }
        
        const validationToken = url.searchParams.get('validationToken');
        if (validationToken) {
            return new Response(validationToken, {
                headers: { 'Content-Type': 'text/plain' },
            });
        }
        
        return new Response('', {
            headers: { 'Content-Type': 'text/plain' },
        });
    }

    // GET /resubscribe → re-register webhook subscription
    if (method === 'GET' && path === '/resubscribe') {
        try {
            // Build the webhook URL based on the current request URL
            const webhookUrl = new URL('/gymrun/webhook', url.origin).toString();
            const result = await registerSubscription(env, webhookUrl);
            return new Response(JSON.stringify(result, null, 2), {
                headers: { 'Content-Type': 'application/json' },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Unknown error';
            return new Response(JSON.stringify({ error: message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            });
        }
    }
    
	// GET, POST /account → text/html
	if (path === '/account') {
		let message = '';
		if (method === 'POST') {
			const contentType = request.headers.get('Content-Type') || '';
			let refreshKey = '';

			if (contentType.includes('application/x-www-form-urlencoded')) {
				const formData = await request.formData();
				refreshKey = formData.get('refresh_key')?.toString() || '';
			} else if (contentType.includes('application/json')) {
				const body = await request.json<{ refresh_key?: string }>();
				refreshKey = body.refresh_key || '';
			}

			if (refreshKey === env.REFRESH_KEY) {
				try {
					message = await processFile(env, /* force */ true);
				} catch (err) {
					console.error('Error processing file:', err);
					message = 'Error processing file.';
				}
			} else {
				message = 'Invalid refresh key.';
			}
			
		}
		const data = await getFromStorage(env, 'data');
		return new Response((
			`<form method="post"><input type="password" name="refresh_key" /><input type="submit" value="Refresh"></form>` +
			`<output>${message}</output>` +
			`<pre>${JSON.stringify(data, null, 2)}</pre>`
		), {
			headers: { 'Content-Type': 'text/html' },
		});
	}

	// Route not handled
	return null;
}
