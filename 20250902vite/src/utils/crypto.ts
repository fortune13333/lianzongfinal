import { Block } from '../types';

/**
 * Creates a deterministic JSON string from an object, matching Python's json.dumps with sort_keys.
 * This is crucial for consistent hashing between the Python agent and the JS client.
 * @param obj The object to stringify.
 * @returns A deterministic string representation of the object.
 */
const deterministicStringify = (obj: any): string => {
    if (typeof obj !== 'object' || obj === null || obj instanceof Date) {
        // Let JSON.stringify handle primitive types, null, and dates.
        return JSON.stringify(obj);
    }

    if (Array.isArray(obj)) {
        // For arrays, recursively stringify each element.
        return `[${obj.map(item => deterministicStringify(item)).join(',')}]`;
    }

    // For objects, sort keys and recursively stringify values.
    const keys = Object.keys(obj).sort();
    const kvPairs = keys.map(key => {
        const value = obj[key];
        // Undefined values should be ignored in JSON, so we skip them.
        if (value === undefined) {
            return '';
        }
        return `${JSON.stringify(key)}:${deterministicStringify(value)}`;
    }).filter(Boolean); // Filter out empty strings from undefined values
    
    return `{${kvPairs.join(',')}}`;
};


/**
 * Calculates a SHA-256 hash for a given block's content.
 * This ensures data integrity and chain consistency in the simulation.
 * @param block The block object, excluding the hash itself.
 * @returns A promise that resolves to the hex-encoded SHA-256 hash string.
 */
export const calculateBlockHash = async (block: Omit<Block, 'hash'>): Promise<string> => {
  // We stringify the core components of the block to create the content to be hashed.
  // The order and structure are critical for a deterministic hash.
  const blockContent = `${block.index}${block.timestamp}${deterministicStringify(block.data)}${block.prev_hash}`;
  
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(blockContent);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
    console.error("Hashing failed:", error);
    // Fallback for environments where crypto.subtle might not be available (e.g., non-secure contexts)
    return `fallback-hash-${Date.now()}-${Math.random()}`;
  }
};

/**
 * Verifies the integrity of an entire blockchain, providing progress updates.
 * @param chain An array of blocks representing the blockchain.
 * @param onProgress A callback function to report the verification status of each block.
 * @returns A promise resolving to an object indicating if the chain is valid and the index of the first invalid block if any.
 */
export const verifyChain = async (
  chain: Block[],
  onProgress: (index: number, status: 'success' | 'failure', details?: { stored: string; calculated: string }) => void
): Promise<{ isValid: boolean; invalidBlockIndex: number | null }> => {
  for (let i = 0; i < chain.length; i++) {
    // Add a small delay so the UI update is visible to the user
    await new Promise(resolve => setTimeout(resolve, 100));
    const currentBlock = chain[i];

    // 1. Check if the previous hash link is correct (skip for genesis block)
    if (i > 0) {
      const previousBlock = chain[i - 1];
      if (currentBlock.prev_hash !== previousBlock.hash) {
        console.error(`Chain broken at block ${i}: prev_hash does not match previous block's hash.`);
        onProgress(i, 'failure');
        return { isValid: false, invalidBlockIndex: i };
      }
    }

    // 2. Recalculate the hash of the current block and check if it's correct
    const { hash: storedHash, ...blockWithoutHash } = currentBlock;
    const recalculatedHash = await calculateBlockHash(blockWithoutHash);
    
    if (storedHash !== recalculatedHash) {
      console.error(`Data tampered at block ${i}: recalculated hash does not match stored hash.`);
      onProgress(i, 'failure', { stored: storedHash, calculated: recalculatedHash });
      return { isValid: false, invalidBlockIndex: i };
    }

    onProgress(i, 'success');
  }

  return { isValid: true, invalidBlockIndex: null };
};