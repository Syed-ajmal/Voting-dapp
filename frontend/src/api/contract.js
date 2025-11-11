// src/api/contract.js
import { ethers } from "ethers";
import ABI_JSON from "../abi/SimpleVoting.json";

// Environment variables (React requires REACT_APP_ prefix)
const CONTRACT_ADDRESS = process.env.REACT_APP_CONTRACT_ADDRESS || "";
const RPC_URL =
  process.env.REACT_APP_RPC_PROVIDER ||
  process.env.REACT_APP_RPC ||
  process.env.SEPOLIA_URL ||
  "";

// Normalize ABI (artifact may be { abi: [...] } or already an array)
const abi = ABI_JSON?.abi || ABI_JSON;

console.debug("contract.js init ->", {
  contractAddress: CONTRACT_ADDRESS ? CONTRACT_ADDRESS : "MISSING",
  rpcUrl: RPC_URL ? RPC_URL.split("/").slice(0, 3).join("/") + "/..." : "MISSING",
  abiLoaded: Array.isArray(abi),
});

// Basic validations with helpful messages
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
      "REACT_APP_RPC_PROVIDER not set. Add it to frontend/.env or pass an rpcUrl.\n" +
      "Example:\nREACT_APP_RPC_PROVIDER=https://sepolia.infura.io/v3/YOUR_KEY"
    );
  }
}
if (!Array.isArray(abi)) {
  throw new Error("ABI not found or invalid at src/abi/SimpleVoting.json — make sure the file is the compiled artifact or ABI array.");
}

/**
 * getReadOnlyContract(rpcUrl?)
 * Returns a read-only Contract instance using JsonRpcProvider.
 * Throws if RPC or contract address are missing.
 */
export function getReadOnlyContract(rpcUrl = RPC_URL) {
  ensureContractAddress();
  ensureRpcUrl(rpcUrl);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);
  return { contract, provider };
}

/**
 * getSignerContract()
 * Connects to injected wallet (MetaMask) and returns a Contract instance
 * bound to the signer so you can send transactions.
 * Prompts MetaMask for permission if necessary.
 */
export async function getSignerContract() {
  ensureContractAddress();
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No injected wallet found (window.ethereum). Please install MetaMask.");
  }

  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  // Request accounts (will show MetaMask popup if not already connected)
  await browserProvider.send("eth_requestAccounts", []);
  const signer = await browserProvider.getSigner();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, signer);
  return { contract, signer, provider: browserProvider };
}

/**
 * testOwner(rpcUrl?)
 * Convenience helper to read on-chain owner via read-only provider.
 * Usage in browser console:
 *   import('./api/contract.js').then(m => m.testOwner().then(console.log).catch(console.error));
 */
export async function testOwner(rpcUrl = RPC_URL) {
  try {
    const { contract } = getReadOnlyContract(rpcUrl);
    const owner = await contract.owner();
    console.log("Contract owner (read-only):", owner);
    return owner;
  } catch (err) {
    console.error("testOwner failed:", err);
    throw err;
  }
}

export default {
  getReadOnlyContract,
  getSignerContract,
  testOwner,
};
