/**
 * OneDrive API utilities for fetching GymRun backup files
 */

import { callGraphApi, type EnvWithAzure } from './graph-auth';

// ============================================================================
// OneDrive File Operations
// ============================================================================

interface DriveItem {
    id: string;
    name: string;
    lastModifiedDateTime: string;
    '@microsoft.graph.downloadUrl'?: string;
}

interface DriveItemsResponse {
    value: DriveItem[];
}

/**
 * Get the newest GymRun backup ZIP file from OneDrive
 * @returns The file content as Uint8Array
 */
export async function getZip(env: EnvWithAzure): Promise<Uint8Array> {
    // List all files in the GymRun folder
    const response = await callGraphApi(
        env,
        '/me/drive/root:/Apps/GymRun:/children'
    );
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to list folder contents: ${error}`);
    }
    
    const data = await response.json<DriveItemsResponse>();
    
    if (!data.value || data.value.length === 0) {
        throw new Error('No files found in the GymRun folder');
    }
    
    // Filter for .zip files and sort by lastModifiedDateTime descending
    const zipFiles = data.value
        .filter(item => item.name.toLowerCase().endsWith('.zip'))
        .sort((a, b) => new Date(b.lastModifiedDateTime).getTime() - new Date(a.lastModifiedDateTime).getTime());
    
    if (zipFiles.length === 0) {
        throw new Error('No ZIP files found in the GymRun folder');
    }
    
    // Get the newest file
    const newestFile = zipFiles[0];
    
    // Get the file metadata with download URL
    const fileResponse = await callGraphApi(
        env,
        `/me/drive/items/${newestFile.id}`
    );
    
    if (!fileResponse.ok) {
        const error = await fileResponse.text();
        throw new Error(`Failed to get file metadata: ${error}`);
    }
    
    const metadata = await fileResponse.json<DriveItem>();
    
    const downloadUrl = metadata['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) {
        throw new Error('No download URL available for the file');
    }
    
    // Download the actual file content
    const downloadResponse = await fetch(downloadUrl);
    
    if (!downloadResponse.ok) {
        throw new Error(`Failed to download file: ${downloadResponse.status} ${downloadResponse.statusText}`);
    }
    
    const arrayBuffer = await downloadResponse.arrayBuffer();
    return new Uint8Array(arrayBuffer);
}

// ============================================================================
// Subscription Management (for webhooks)
// ============================================================================

interface SubscriptionRequest {
    changeType: string;
    notificationUrl: string;
    resource: string;
    expirationDateTime: string;
    clientState?: string;
}

interface SubscriptionResponse {
    id: string;
    resource: string;
    changeType: string;
    notificationUrl: string;
    expirationDateTime: string;
}

/**
 * Register a webhook subscription for file changes in the GymRun folder
 * @param env Environment with Azure credentials
 * @param notificationUrl The URL to receive webhook notifications
 * @returns The created subscription
 */
export async function registerSubscription(
    env: EnvWithAzure,
    notificationUrl: string
): Promise<SubscriptionResponse> {
    // Calculate expiration date (max 30 days for drive items)
    const expirationDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const expirationDateTime = expirationDate.toISOString();
    
    const subscription: SubscriptionRequest = {
        changeType: 'updated',
        notificationUrl: notificationUrl,
        resource: '/me/drive/root',
        expirationDateTime: expirationDateTime,
    };
    
    const response = await callGraphApi(env, '/subscriptions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(subscription),
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to create subscription: ${error}`);
    }
    
    return response.json();
}

/**
 * Renew an existing subscription
 */
export async function renewSubscription(
    env: EnvWithAzure,
    subscriptionId: string
): Promise<SubscriptionResponse> {
    const expirationDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const expirationDateTime = expirationDate.toISOString();
    
    const response = await callGraphApi(env, `/subscriptions/${subscriptionId}`, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            expirationDateTime: expirationDateTime,
        }),
    });
    
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to renew subscription: ${error}`);
    }
    
    return response.json();
}

/**
 * Delete a subscription
 */
export async function deleteSubscription(
    env: EnvWithAzure,
    subscriptionId: string
): Promise<void> {
    const response = await callGraphApi(env, `/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
    });
    
    if (!response.ok && response.status !== 404) {
        const error = await response.text();
        throw new Error(`Failed to delete subscription: ${error}`);
    }
}
