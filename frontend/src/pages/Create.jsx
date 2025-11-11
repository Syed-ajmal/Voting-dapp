// src/pages/Create.jsx
import React, { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { getReadOnlyContract, getSignerContract } from "../api/contract";

/**
 * Create.jsx (fixed: removed invalid optional-chaining + `new` expression)
 *
 * Edge cases handled:
 *  - Missing MetaMask
 *  - Missing REACT_APP_* env variables (contract.js throws)
 *  - Owner mismatch
 *  - User cancels MetaMask confirm (code 4001)
 *  - Transaction revert / insufficient funds
 *  - Network mismatch (wallet vs RPC) — best-effort check using getSignerContract()
 */

export default function Create() {
  const { address: connectedAddress, connect } = useWallet();

  const [ownerAddress, setOwnerAddress] = useState(null);
  const [loadingOwner, setLoadingOwner] = useState(true);
  const [rpcChainId, setRpcChainId] = useState(null);

  const [title, setTitle] = useState("");
  const [startIso, setStartIso] = useState("");
  const [endIso, setEndIso] = useState("");
  const [candidatesCsv, setCandidatesCsv] = useState("");
  const [merkleRoot, setMerkleRoot] = useState("");
  const [busy, setBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);

  // Load owner using read-only RPC once on mount
  useEffect(() => {
    let mounted = true;
    async function loadOwner() {
      setLoadingOwner(true);
      setStatusMessage(null);
      try {
        const { contract, provider } = getReadOnlyContract();
        const o = await contract.owner();
        if (!mounted) return;
        setOwnerAddress(o);
        try {
          const net = await provider.getNetwork();
          if (mounted) setRpcChainId(net.chainId);
        } catch (e) {
          console.warn("Could not read RPC network:", e);
        }
      } catch (err) {
        console.error("Failed to read owner via RPC:", err);
        if (mounted) {
          setOwnerAddress(null);
          setStatusMessage("Failed to read contract owner via RPC. Check RPC URL and network.");
        }
      } finally {
        if (mounted) setLoadingOwner(false);
      }
    }
    loadOwner();
    return () => { mounted = false; };
  }, []);

  function resetStatus() {
    setStatusMessage(null);
  }

  async function ensureConnected() {
    if (!connectedAddress) {
      await connect();
      // short delay to let WalletContext update
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  function validateInputs() {
    if (!title.trim()) return "Title is required.";
    if (!startIso || !endIso) return "Start and end time are required.";
    const startTs = Math.floor(new Date(startIso).getTime() / 1000);
    const endTs = Math.floor(new Date(endIso).getTime() / 1000);
    if (isNaN(startTs) || isNaN(endTs)) return "Invalid start or end date.";
    if (startTs >= endTs) return "Start time must be before end time.";
    const candidates = candidatesCsv.split(",").map(s => s.trim()).filter(Boolean);
    if (candidates.length === 0) return "Provide at least one candidate.";
    return null;
  }

  function friendlyErrorMessage(err) {
    if (!err) return "Unknown error";
    if (err.code === 4001) return "Transaction cancelled by user (MetaMask).";
    const msg = err?.reason || err?.data?.message || err?.message || String(err);
    if (msg.toLowerCase().includes("insufficient funds")) return "Insufficient funds for gas.";
    if (msg.toLowerCase().includes("user rejected")) return "Transaction cancelled by user.";
    if (msg.toLowerCase().includes("revert")) return "Transaction reverted by contract: " + msg;
    return msg;
  }

  async function handleCreate(e) {
    e.preventDefault();
    resetStatus();

    // client-side validation
    const v = validateInputs();
    if (v) {
      setStatusMessage(v);
      return;
    }
    const startTs = Math.floor(new Date(startIso).getTime() / 1000);
    const endTs = Math.floor(new Date(endIso).getTime() / 1000);
    const candidates = candidatesCsv.split(",").map(s => s.trim()).filter(Boolean);
    const rootArg = (merkleRoot && merkleRoot.startsWith("0x") && merkleRoot.length === 66)
      ? merkleRoot
      : "0x" + "0".repeat(64);

    if (!ownerAddress) {
      setStatusMessage("Cannot determine contract owner (RPC).");
      return;
    }

    // Ensure wallet connected
    try {
      await ensureConnected();
    } catch (err) {
      console.error("connect failed:", err);
      setStatusMessage("Wallet connect failed: " + friendlyErrorMessage(err));
      return;
    }

    if (!connectedAddress) {
      setStatusMessage("Please connect MetaMask with the owner account.");
      return;
    }
    if (ownerAddress.toLowerCase() !== connectedAddress.toLowerCase()) {
      setStatusMessage("Connected account is not the contract owner.");
      return;
    }

    // Best-effort network check: compare signer provider network with RPC chain id
    if (rpcChainId != null) {
      try {
        const { provider: signerProvider } = await getSignerContract().catch(() => ({ provider: null }));
        if (signerProvider && typeof signerProvider.getNetwork === "function") {
          const walletNet = await signerProvider.getNetwork();
          if (walletNet && walletNet.chainId !== rpcChainId) {
            setStatusMessage("Network mismatch: your wallet network does not match RPC network. Switch MetaMask network.");
            return;
          }
        }
      } catch (err) {
        // Don't block the user just because we couldn't read the network; warn in console
        console.warn("Failed to compare networks:", err);
      }
    }

    // send transaction
    setBusy(true);
    setStatusMessage("Submitting transaction (please confirm in MetaMask)...");
    try {
      const { contract } = await getSignerContract();
      const tx = await contract.createBallot(title, startTs, endTs, rootArg, candidates);
      setStatusMessage("Transaction submitted — waiting for confirmation...");
      try {
        await tx.wait();
        setStatusMessage("Ballot created successfully ✅");
        setTitle(""); setStartIso(""); setEndIso(""); setCandidatesCsv(""); setMerkleRoot("");
      } catch (waitErr) {
        console.error("tx.wait failed:", waitErr);
        setStatusMessage("Transaction failed while waiting: " + friendlyErrorMessage(waitErr));
      }
    } catch (err) {
      console.error("createBallot error:", err);
      setStatusMessage("Create failed: " + friendlyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const isOwner = ownerAddress && connectedAddress && ownerAddress.toLowerCase() === connectedAddress.toLowerCase();
  const disableCreate = busy || loadingOwner || !isOwner;

  return (
    <div style={{ padding: 12 }}>
      <h2>Create Ballot</h2>

      <div style={{ marginBottom: 12 }}>
        <div><strong>Contract owner (RPC):</strong> {loadingOwner ? "loading..." : (ownerAddress || "not available")}</div>
        <div><strong>Connected wallet:</strong> {connectedAddress || "not connected"}</div>
        {!connectedAddress && <div style={{ marginTop: 8 }}><button onClick={() => connect().catch(e => setStatusMessage("Connect failed: " + friendlyErrorMessage(e)))}>Connect Wallet</button></div>}
        {connectedAddress && !isOwner && <div style={{ color: "red", marginTop: 8 }}>Connected account is not the contract owner — cannot create ballots.</div>}
      </div>

      {statusMessage && <div style={{ marginBottom: 10, color: busy ? "black" : "darkred" }}>{statusMessage}</div>}

      <form onSubmit={handleCreate}>
        <div style={{ marginBottom: 8 }}>
          <label>Title<br />
            <input value={title} onChange={e => setTitle(e.target.value)} />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>Start (local datetime)<br />
            <input type="datetime-local" value={startIso} onChange={e => setStartIso(e.target.value)} />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>End (local datetime)<br />
            <input type="datetime-local" value={endIso} onChange={e => setEndIso(e.target.value)} />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>Candidates (comma separated)<br />
            <input value={candidatesCsv} onChange={e => setCandidatesCsv(e.target.value)} placeholder="Alice,Bob" />
          </label>
        </div>

        <div style={{ marginBottom: 8 }}>
          <label>Merkle root (optional, 0x... or blank)<br />
            <input value={merkleRoot} onChange={e => setMerkleRoot(e.target.value)} placeholder="0x..." />
          </label>
        </div>

        <div style={{ marginTop: 10 }}>
          <button type="submit" disabled={disableCreate}>
            {busy ? "Working..." : (loadingOwner ? "Loading owner..." : (isOwner ? "Create Ballot" : "Owner only"))}
          </button>
        </div>
      </form>

      <div style={{ marginTop: 12, fontSize: 12, color: "#666" }}>
        <div>Notes:</div>
        <ul>
          <li>Only the contract owner (deployer) can create ballots.</li>
          <li>If you cancel the MetaMask confirmation, the transaction will not be sent and you'll see a cancellation message.</li>
          <li>Check browser devtools console for detailed diagnostics if something unexpected happens.</li>
        </ul>
      </div>
    </div>
  );
}
