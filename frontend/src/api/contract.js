// src/api/contract.js
import { ethers } from "ethers";
import ABI_JSON from "../abi/SimpleVoting.json";
import { withRetries } from "./retryRpc";

// Environment: allow multiple RPC env vars
const CONTRACT_ADDRESS =
  process.env.REACT_APP_CONTRACT_ADDRESS ||
  process.env.CONTRACT_ADDRESS ||
  "";

const RPCS = [
  process.env.REACT_APP_RPC_PROVIDER,
  process.env.REACT_APP_RPC_PROVIDER_2,
  process.env.REACT_APP_RPC_PROVIDER_3,
  process.env.REACT_APP_RPC,
  process.env.SEPOLIA_URL,
].filter(Boolean);

// Normalize ABI
const abi = ABI_JSON?.abi || ABI_JSON;

console.debug("contract.js init ->", {
  contractAddress: CONTRACT_ADDRESS ? CONTRACT_ADDRESS : "MISSING",
  rpcCount: RPCS.length,
  abiLoaded: Array.isArray(abi),
});

function ensureContractAddress() {
  if (!CONTRACT_ADDRESS || typeof CONTRACT_ADDRESS !== "string" || CONTRACT_ADDRESS.trim() === "") {
    throw new Error(
      "REACT_APP_CONTRACT_ADDRESS not set. Add it to frontend/.env and restart dev server.\n" +
        "Example:\nREACT_APP_CONTRACT_ADDRESS=0xYourDeployedContractAddress"
    );
  }
}
function ensureRpcUrl(rpc) {
  if (!rpc || typeof rpc !== "string" || rpc.trim() === "") {
    throw new Error(
      "No RPC provider found. Set REACT_APP_RPC_PROVIDER (and optionally REACT_APP_RPC_PROVIDER_2) in .env.\n" +
        "Example:\nREACT_APP_RPC_PROVIDER=https://sepolia.infura.io/v3/YOUR_KEY"
    );
  }
}
if (!Array.isArray(abi)) {
  throw new Error("ABI not found or invalid at src/abi/SimpleVoting.json — make sure the file is the compiled artifact or ABI array.");
}

async function tryProvider(url) {
  const provider = new ethers.JsonRpcProvider(url);
  // sanity check
  await provider.getBlockNumber();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
  return { provider, contract, url };
}

export async function getReadOnlyContract(rpcUrl = undefined) {
  ensureContractAddress();

  // build try list (explicit rpcUrl first, then env-provided list)
  const tryList = typeof rpcUrl === "string" && rpcUrl ? [rpcUrl, ...RPCS] : RPCS.slice();
  if (tryList.length === 0) {
    throw new Error("No RPC URLs configured. Set REACT_APP_RPC_PROVIDER in .env.");
  }

  let lastError = null;
  for (const url of tryList) {
    try {
      console.info(`[contract] trying RPC: ${url}`);
      ensureRpcUrl(url);
      const res = await withRetries(() => tryProvider(url), { retries: 2, initialDelay: 250 });
      console.info(`[contract] RPC OK: ${url}`);
      return res;
    } catch (err) {
      console.warn(`[contract] RPC failed: ${url}`, err?.message || err);
      lastError = err;
    }
  }

  console.error("[contract] all RPCs failed", lastError);
  throw lastError || new Error("No working RPC provider found. Check your REACT_APP_RPC_PROVIDER variables.");
}

export async function getSignerContract() {
  ensureContractAddress();

  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No injected wallet found (window.ethereum). Please install MetaMask.");
  }

  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  await browserProvider.send("eth_requestAccounts", []);
  const signer = await browserProvider.getSigner();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
  return { contract, signer, provider: browserProvider };
}

export async function testOwner(rpcUrl = undefined) {
  const { contract } = await getReadOnlyContract(rpcUrl);
  const owner = await contract.owner();
  console.log("Contract owner (read-only):", owner);
  return owner;
}

// default export for compatibility
export default {
  getReadOnlyContract,
  getSignerContract,
  testOwner,
};
