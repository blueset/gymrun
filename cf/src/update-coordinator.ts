import { DurableObject } from 'cloudflare:workers';
import { type EnvWithAzure } from './graph-auth';
import { getFromStorage, setInStorage } from './storage';
import { getZip } from './onedrive';
import { processZip, getMaxTime, type ExerciseGroups } from './gymrun';
import { tootCard } from './toot';

/**
 * Durable Object that coordinates GymRun file processing to prevent race conditions.
 * Ensures that only one update operation can proceed at a time using blockConcurrencyWhile.
 */
export class GymrunUpdateCoordinator extends DurableObject {
	/**
	 * Process the GymRun backup file with coordination to prevent duplicate posts.
	 * This method is called via RPC from the Worker and serializes all concurrent updates.
	 * 
	 * @param env Environment with Azure credentials and storage
	 * @param force Force update even if data hasn't changed
	 * @returns Result message from tootCard if update was performed, undefined otherwise
	 */
	async processFile(env: EnvWithAzure, force: boolean = false): Promise<string | void> {
		// Use blockConcurrencyWhile to ensure atomic check-update-post operation
		// If multiple requests arrive concurrently, they will be queued and processed one at a time
		return await this.ctx.blockConcurrencyWhile(async () => {
			// Fetch the latest data from OneDrive
			const zip = await getZip(env);
			const data: ExerciseGroups = await processZip(zip);

			const newTime = getMaxTime(data);
			const lastTime = await getFromStorage(env, 'lastUpdated') || 0;

			// Only update and post if data is newer (or force flag is set)
			if (force || newTime > lastTime) {
				setInStorage(env, 'lastUpdated', newTime);
				setInStorage(env, 'data', data);
				return await tootCard(data, newTime, env);
			}
		});
	}
}
