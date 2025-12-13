/**
 * GymRun data processing utilities
 *
 * Handles extraction and parsing of GymRun backup data from
 * AES-encrypted ZIP files containing SQLite databases.
 */

// @ts-ignore - Cloudflare Workers compatible sql.js
import initSqlJs from 'cloudflare-worker-sqlite-wasm/dist/sql-cf-wasm';
// @ts-ignore - Cloudflare Workers WASM import
import sqlWasm from 'cloudflare-worker-sqlite-wasm/dist/sql-cf-wasm.wasm';

// ============================================================================
// Types
// ============================================================================

export type WeightUnit = 'lbs' | 'kg' | null;

export interface Exercise {
	time: number; // Unix timestamp in milliseconds
	name: string;
	unit: WeightUnit;
	weight: number;
	reps: number;
	set: number;
}

export type ExerciseGroups = Exercise[][];

// ============================================================================
// Unit Conversion
// ============================================================================

export function lbsToKg(lbs: number): number {
	return lbs * 0.45359237;
}

export function kgToLbs(kg: number): number {
	return kg * 2.20462262;
}

// ============================================================================
// AES ZIP Decryption (WinZip AES format)
// ============================================================================

// GymRun uses AES-encrypted ZIP with this hardcoded password
const ZIP_PASSWORD = '13-ImPeRiOn,90#';

/**
 * Parse a ZIP file and find the encrypted file entry
 * Handles both normal headers and data descriptor mode (when sizes are zero in local header)
 */
function parseZipCentralDirectory(data: Uint8Array): {
	compressedData: Uint8Array;
	compressionMethod: number;
	actualCompressionMethod: number;
	compressedSize: number;
	uncompressedSize: number;
	aesStrength: number;
	salt: Uint8Array;
	passwordVerifier: Uint8Array;
	authCode: Uint8Array;
} {
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

	// First, find the central directory to get accurate file sizes
	// The End of Central Directory record is at the end of the file
	// Signature: 0x06054b50
	let eocdOffset = data.length - 22; // Minimum EOCD size
	while (eocdOffset >= 0) {
		if (view.getUint32(eocdOffset, true) === 0x06054b50) {
			break;
		}
		eocdOffset--;
	}

	if (eocdOffset < 0) {
		throw new Error('Invalid ZIP file: cannot find End of Central Directory');
	}

	// Read EOCD to find Central Directory offset
	const cdOffset = view.getUint32(eocdOffset + 16, true);
	
	// Read Central Directory File Header (signature: 0x02014b50)
	if (view.getUint32(cdOffset, true) !== 0x02014b50) {
		throw new Error('Invalid ZIP file: cannot find Central Directory File Header');
	}

	// Parse Central Directory entry for accurate sizes
	const cdCompressionMethod = view.getUint16(cdOffset + 10, true);
	const cdCompressedSize = view.getUint32(cdOffset + 20, true);
	const cdUncompressedSize = view.getUint32(cdOffset + 24, true);
	const cdFileNameLength = view.getUint16(cdOffset + 28, true);
	const cdExtraFieldLength = view.getUint16(cdOffset + 30, true);

	// Parse Central Directory extra field for AES info
	let aesStrength = 0;
	let actualCompressionMethod = 0;
	let cdExtraOffset = cdOffset + 46 + cdFileNameLength;
	const cdExtraEnd = cdExtraOffset + cdExtraFieldLength;

	while (cdExtraOffset < cdExtraEnd) {
		const headerId = view.getUint16(cdExtraOffset, true);
		cdExtraOffset += 2;
		const dataSize = view.getUint16(cdExtraOffset, true);
		cdExtraOffset += 2;

		if (headerId === 0x9901) {
			// AES extra data field
			const aesVersion = view.getUint16(cdExtraOffset, true);
			cdExtraOffset += 2;
			cdExtraOffset += 2; // Skip vendor ID ("AE")
			aesStrength = view.getUint8(cdExtraOffset);
			cdExtraOffset += 1;
			actualCompressionMethod = view.getUint16(cdExtraOffset, true);
			cdExtraOffset += 2;
		} else {
			cdExtraOffset += dataSize;
		}
	}

	// Now parse Local File Header to find data offset
	let offset = 0;
	if (view.getUint32(offset, true) !== 0x04034b50) {
		throw new Error('Invalid ZIP file: missing local file header signature');
	}

	offset += 4; // Skip signature
	offset += 2; // version needed
	const generalPurposeFlag = view.getUint16(offset, true);
	offset += 2;
	const compressionMethod = view.getUint16(offset, true);
	offset += 2;
	offset += 4; // Skip last mod time and date
	offset += 4; // Skip CRC-32
	offset += 4; // Skip compressed size (may be 0 for data descriptor)
	offset += 4; // Skip uncompressed size (may be 0 for data descriptor)
	const fileNameLength = view.getUint16(offset, true);
	offset += 2;
	const extraFieldLength = view.getUint16(offset, true);
	offset += 2;

	// Skip filename and extra field
	offset += fileNameLength + extraFieldLength;

	// Use sizes from Central Directory (which are always accurate)
	const compressedSize = cdCompressedSize;
	const uncompressedSize = cdUncompressedSize;

	// For AES encryption, the data format is:
	// [salt (8/12/16 bytes)] [password verification (2 bytes)] [encrypted data] [auth code (10 bytes)]
	const saltLength = aesStrength === 1 ? 8 : aesStrength === 2 ? 12 : 16;
	const salt = data.slice(offset, offset + saltLength);
	offset += saltLength;

	const passwordVerifier = data.slice(offset, offset + 2);
	offset += 2;

	// Auth code is at the end (10 bytes)
	const encryptedDataLength = compressedSize - saltLength - 2 - 10;
	const encryptedData = data.slice(offset, offset + encryptedDataLength);
	offset += encryptedDataLength;

	const authCode = data.slice(offset, offset + 10);

	return {
		compressedData: encryptedData,
		compressionMethod,
		actualCompressionMethod,
		compressedSize,
		uncompressedSize,
		aesStrength,
		salt,
		passwordVerifier,
		authCode,
	};
}

/**
 * Derive AES key and authentication key from password using PBKDF2
 */
async function deriveKeys(
	password: string,
	salt: Uint8Array,
	aesStrength: number
): Promise<{ aesKeyBytes: Uint8Array; authKey: Uint8Array; passwordVerifier: Uint8Array }> {
	const keyLength = aesStrength === 1 ? 16 : aesStrength === 2 ? 24 : 32;
	const derivedKeyLength = keyLength * 2 + 2; // AES key + Auth key + Password verification

	const passwordBytes = new TextEncoder().encode(password);
	const baseKey = await crypto.subtle.importKey('raw', passwordBytes, 'PBKDF2', false, ['deriveBits']);

	const derivedBits = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: salt,
			iterations: 1000,
			hash: 'SHA-1',
		},
		baseKey,
		derivedKeyLength * 8
	);

	const derivedBytes = new Uint8Array(derivedBits);
	const aesKeyBytes = derivedBytes.slice(0, keyLength);
	const authKeyBytes = derivedBytes.slice(keyLength, keyLength * 2);
	const passwordVerifier = derivedBytes.slice(keyLength * 2, keyLength * 2 + 2);

	return { aesKeyBytes, authKey: authKeyBytes, passwordVerifier };
}

/**
 * Decrypt AES-CTR encrypted data using WinZip's little-endian counter format
 * Web Crypto's AES-CTR uses big-endian counters, so we implement CTR mode manually
 */
async function decryptAesCtr(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
	// WinZip AES uses AES-CTR with:
	// - Counter starting at 1
	// - Counter is a 128-bit little-endian integer
	// Since Web Crypto uses big-endian, we implement CTR manually using raw AES

	// Import key for raw AES encryption (to encrypt counter blocks)
	const aesKey = await crypto.subtle.importKey(
		'raw',
		keyBytes,
		{ name: 'AES-CBC' }, // We'll use CBC with zero IV to get raw AES block encryption
		false,
		['encrypt']
	);

	const blockSize = 16;
	const numBlocks = Math.ceil(data.length / blockSize);
	const result = new Uint8Array(data.length);

	// Process each block
	for (let blockNum = 0; blockNum < numBlocks; blockNum++) {
		// Create counter block: little-endian counter starting at 1
		const counter = new Uint8Array(blockSize);
		let counterValue = blockNum + 1; // Start at 1, not 0
		
		// Write counter as little-endian 128-bit integer
		for (let i = 0; i < 16 && counterValue > 0; i++) {
			counter[i] = counterValue & 0xff;
			counterValue = Math.floor(counterValue / 256);
		}

		// Encrypt the counter block using AES
		// Use CBC with zero IV to get raw AES block encryption
		const zeroIv = new Uint8Array(16);
		const encryptedCounter = await crypto.subtle.encrypt(
			{ name: 'AES-CBC', iv: zeroIv },
			aesKey,
			counter
		);

		// AES-CBC adds padding, so take only first 16 bytes
		const keystream = new Uint8Array(encryptedCounter).slice(0, blockSize);

		// XOR with ciphertext to get plaintext
		const blockStart = blockNum * blockSize;
		const blockEnd = Math.min(blockStart + blockSize, data.length);
		
		for (let i = blockStart; i < blockEnd; i++) {
			result[i] = data[i] ^ keystream[i - blockStart];
		}
	}

	return result;
}

/**
 * Inflate (decompress) DEFLATE data using DecompressionStream
 */
async function inflate(data: Uint8Array): Promise<Uint8Array> {
	// Create a readable stream from the compressed data
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(data);
			controller.close();
		},
	});

	// Use DecompressionStream with 'deflate-raw' for ZIP deflate
	const decompressedStream = stream.pipeThrough(new DecompressionStream('deflate-raw'));

	// Collect all chunks
	const reader = decompressedStream.getReader();
	const chunks: Uint8Array[] = [];

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(value);
	}

	// Concatenate chunks
	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result;
}

/**
 * Decrypt AES-encrypted ZIP file and extract gymapp.db
 */
async function decryptAesZip(zipData: Uint8Array): Promise<Uint8Array> {
	const zipInfo = parseZipCentralDirectory(zipData);

	console.log('ZIP Info:', {
		compressionMethod: zipInfo.compressionMethod,
		actualCompressionMethod: zipInfo.actualCompressionMethod,
		aesStrength: zipInfo.aesStrength,
		compressedSize: zipInfo.compressedSize,
		uncompressedSize: zipInfo.uncompressedSize,
		saltLength: zipInfo.salt.length,
		encryptedDataLength: zipInfo.compressedData.length,
	});

	// Derive keys from password
	const { aesKeyBytes, passwordVerifier } = await deriveKeys(ZIP_PASSWORD, zipInfo.salt, zipInfo.aesStrength);

	// Verify password
	if (
		passwordVerifier[0] !== zipInfo.passwordVerifier[0] ||
		passwordVerifier[1] !== zipInfo.passwordVerifier[1]
	) {
		throw new Error('Invalid password or corrupted ZIP file');
	}

	console.log('Password verified successfully');

	// Decrypt the data
	const decryptedData = await decryptAesCtr(aesKeyBytes, zipInfo.compressedData);

	console.log('Decrypted data length:', decryptedData.length);
	console.log('First 16 bytes:', Array.from(decryptedData.slice(0, 16)).map(b => b.toString(16).padStart(2, '0')).join(' '));

	// Determine the actual compression method
	// When compressionMethod is 99 (AES), the actual method is in the AES extra field
	const effectiveMethod = zipInfo.compressionMethod === 99 
		? zipInfo.actualCompressionMethod 
		: zipInfo.compressionMethod;

	console.log('Effective compression method:', effectiveMethod);

	// Decompress if needed (compression method 8 = DEFLATE)
	if (effectiveMethod === 8) {
		return await inflate(decryptedData);
	} else if (effectiveMethod === 0) {
		// Stored (no compression)
		return decryptedData;
	}

	throw new Error(`Unsupported compression method: ${effectiveMethod}`);
}

/**
 * Extract the SQLite database from the GymRun backup ZIP
 */
export async function getSqliteFile(zipData: Uint8Array): Promise<Uint8Array> {
	return decryptAesZip(zipData);
}

// ============================================================================
// SQLite Processing
// ============================================================================

interface RawExerciseRow {
    time: number;
    data: string;
    xlabel: string;
    unit: string | null;
}

/**
 * Read exercise data from the SQLite database
 * Returns data from the most recent workout
 */
export async function readSqliteFile(sqliteData: Uint8Array): Promise<RawExerciseRow[]> {
    // Initialize sql.js with inline WASM for Cloudflare Workers
    const SQL = await initSqlJs({
        // Use instantiateWasm to provide the WASM module directly
        // This avoids the __dirname issue in Cloudflare Workers
        instantiateWasm(info: WebAssembly.Imports, receive: (instance: WebAssembly.Instance) => void) {
            const instance = new WebAssembly.Instance(sqlWasm, info);
            receive(instance);
            return instance.exports;
        },
    });
    const db = new SQL.Database(sqliteData);
    
    try {
        const query = `
            SELECT entry.time, entry.data, exercise.xlabel, exercise.unit 
            FROM entry 
            INNER JOIN exercise ON entry.exercise = exercise._id 
            WHERE entry.time >= (SELECT time_start FROM workout ORDER BY time_start DESC LIMIT 1) 
              AND entry.time <= (SELECT time_end FROM workout ORDER BY time_start DESC LIMIT 1)
        `;
        
        const results = db.exec(query);
        
        if (results.length === 0 || results[0].values.length === 0) {
            return [];
        }
        
        const rows: RawExerciseRow[] = results[0].values.map((row: (string | number | Uint8Array | null)[]) => ({
            time: row[0] as number,
            data: row[1] as string,
            xlabel: row[2] as string,
            unit: row[3] as string | null,
        }));
        
        return rows;
    } finally {
        db.close();
    }
}

/**
 * Parse raw database rows into structured Exercise objects
 */
export function parseData(rawData: RawExerciseRow[]): ExerciseGroups {
    const exercises: Exercise[] = rawData.map((row) => {
        // Parse the data field: "3-1,4-45.5,5-10" format
        // Where: 3=set number, 4=weight (kg), 5=reps, 52=extra reps
        const propertyPairs = new Map<number, number>();
        
        if (row.data) {
            const pairs = row.data.split(',');
            for (const pair of pairs) {
                const [keyStr, valueStr] = pair.split('-');
                const key = parseFloat(keyStr);
                const value = parseFloat(valueStr);
                if (!isNaN(key) && !isNaN(value)) {
                    propertyPairs.set(key, value);
                }
            }
        }
        
        const setNumber = Math.floor(propertyPairs.get(3) ?? 0);
        let weight = propertyPairs.get(4) ?? 0;
        const reps = Math.floor((propertyPairs.get(5) ?? 0) + (propertyPairs.get(52) ?? 0));
        
        // Determine unit: null = bodyweight, "2" = lbs, else = kg
        let unit: WeightUnit = null;
        if (row.unit !== null) {
            unit = row.unit === '2' ? 'lbs' : 'kg';
        }
        
        // Convert weight to display unit
        if (unit === 'lbs') {
            weight = Math.round(kgToLbs(weight));
        } else if (unit === 'kg') {
            weight = Math.floor(weight);
        }
        
        return {
            time: row.time * 1000, // Convert to milliseconds
            name: row.xlabel,
            unit,
            weight,
            reps,
            set: setNumber,
        };
    });
    
    // Sort by set, then group by name
    exercises.sort((a, b) => a.set - b.set);
    exercises.sort((a, b) => a.name.localeCompare(b.name));
    
    // Group by exercise name
    const groups: ExerciseGroups = [];
    let currentGroup: Exercise[] = [];
    let currentName = '';
    
    for (const exercise of exercises) {
        if (exercise.name !== currentName) {
            if (currentGroup.length > 0) {
                groups.push(currentGroup);
            }
            currentGroup = [exercise];
            currentName = exercise.name;
        } else {
            currentGroup.push(exercise);
        }
    }
    
    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }
    
    return groups;
}

/**
 * Process a GymRun backup ZIP file and return parsed exercise data
 */
export async function processZip(zipData: Uint8Array): Promise<ExerciseGroups> {
    const sqliteFile = await getSqliteFile(zipData);
    const rawData = await readSqliteFile(sqliteFile);
    return parseData(rawData);
}

/**
 * Process a raw SQLite database file and return parsed exercise data
 */
export async function processDb(sqliteData: Uint8Array): Promise<ExerciseGroups> {
    const rawData = await readSqliteFile(sqliteData);
    return parseData(rawData);
}

/**
 * Flatten exercise groups into a single array
 */
export function flattenExercises(groups: ExerciseGroups): Exercise[] {
    return groups.flat();
}

/**
 * Get the maximum time from exercise groups
 */
export function getMaxTime(groups: ExerciseGroups): number {
    const allExercises = flattenExercises(groups);
    if (allExercises.length === 0) return 0;
    return Math.max(...allExercises.map(e => e.time));
}
