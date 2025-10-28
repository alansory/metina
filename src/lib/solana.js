import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export function getSolanaConnection() {
  const rpc = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
  return new Connection(rpc, 'confirmed');
}

export function getKeypairFromEnv() {
  const secret = process.env.SIGNER_PRIVATE_KEY_B58 || '';
  if (!secret) throw new Error('Missing SIGNER_PRIVATE_KEY_B58');
  
  try {
    // Coba parse sebagai array JSON
    if (secret.startsWith('[') && secret.endsWith(']')) {
      console.log('Parsing private key as array format...');
      const secretArray = JSON.parse(secret);
      if (Array.isArray(secretArray) && secretArray.length === 64) {
        const secretBytes = new Uint8Array(secretArray);
        return Keypair.fromSecretKey(secretBytes);
      } else {
        throw new Error('Invalid array format - must be 64 numbers');
      }
    } else {
      // Coba parse sebagai base58
      console.log('Parsing private key as base58 format...');
      const secretBytes = bs58.decode(secret);
      return Keypair.fromSecretKey(secretBytes);
    }
  } catch (err) {
    throw new Error(`Invalid private key format: ${err.message}`);
  }
}

