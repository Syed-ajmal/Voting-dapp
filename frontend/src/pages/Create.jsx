// src/pages/Create.jsx
import React, { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { getReadOnlyContract, getSignerContract } from "../api/contract";

/**
 * Create.jsx
 *
 * - Prevents selecting past start times by using input `min` and runtime validation
 * - Keeps your existing protections (owner check, network check, etc.)
 */

function toLocalDatetimeInputString(d = new Date()) {
  // returns YYYY-MM-DDTHH:mm for datetime-local input (local timezone)
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}

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

  // min allowed start (datetime-local string)
  const [minStartLocal, setMinStartLocal] = useState(toLocalDatetimeInputString());

  // update minStartLocal every time component mounts (keeps it fresh)
  useEffect(() => {
    setMinStartLocal(toLocalDatetimeInputString());
    // optional: you could update every minute with a timer to keep min fresh,
    // but this is usually enough for ordinary use.
  }, []);

  // Load owner using read-only RPC once on mount
  useEffect(() => {
    let mounted = true;
    async function loadOwner() {
      setLoadingOwner(true);
      setStatusMessage(null);
      try {
        const res = await getReadOnlyContract();
        const contract = res.contract;
        const provider = res.provider;
        console.info("[Create] using RPC:", res.url);

        const o = await contract.owner();
        if (!mounted) return;
        setOwnerAddress(o);

        try {
          const net = await provider.getNetwork();
          if (mounted) setRpcChainId(net.chainId);
        } catch (e) {
          console.warn("[Create] could not read RPC network:", e);
        }
      } catch (err) {
        console.error("Failed to read owner via RPC:", err);
        if (mounted) {
          setOwnerAddress(null);
          setStatusMessage("Failed to read contract owner via RPC. Check RPC URL and network (see console).");
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

    const nowTs = Math.floor(Date.now() / 1000);
    if (startTs <= nowTs) return "Start time must be in the future."; // <- new check

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
        // refresh minStart to current time after creation
        setMinStartLocal(toLocalDatetimeInputString());
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
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Create Ballot</h1>
        <p className="page-subtitle">Create a new voting ballot (owner only)</p>
      </div>

      <div className="card mb-6">
        <div className="mb-4">
          <div className="mb-2"><strong>Contract owner (RPC):</strong> {loadingOwner ? <span className="spinner" style={{ marginLeft: 8 }}></span> : <span className="address">{ownerAddress || "not available"}</span>}</div>
          <div className="mb-2"><strong>Connected wallet:</strong> {connectedAddress ? <span className="address">{connectedAddress}</span> : "not connected"}</div>
          {!connectedAddress && (
            <div className="mt-3">
              <button className="btn btn-primary btn-sm" onClick={() => connect().catch(e => setStatusMessage("Connect failed: " + friendlyErrorMessage(e)))}>
                Connect Wallet
              </button>
            </div>
          )}
          {connectedAddress && !isOwner && (
            <div className="status-message status-message-error mt-3">
              Connected account is not the contract owner — cannot create ballots.
            </div>
          )}
        </div>
      </div>

      {statusMessage && (
        <div className={`status-message ${busy ? "status-message-info" : "status-message-error"} mb-4`}>
          {statusMessage}
        </div>
      )}

      <div className="card">
        <form onSubmit={handleCreate}>
          <div className="form-group">
            <label className="form-label">Title</label>
            <input 
              className="form-input" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              placeholder="Enter ballot title"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Start (local datetime)</label>
            <input
              className="form-input"
              type="datetime-local"
              value={startIso}
              onChange={e => {
                setStartIso(e.target.value);
                // if end is set but earlier than new start, reset end
                if (endIso && e.target.value) {
                  const s = new Date(e.target.value).getTime();
                  const en = new Date(endIso).getTime();
                  if (!isNaN(s) && !isNaN(en) && en <= s) {
                    setEndIso("");
                  }
                }
              }}
              min={minStartLocal}
            />
            <div className="form-help">
              Note: start must be in the future (cannot pick a past date/time).
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">End (local datetime)</label>
            <input
              className="form-input"
              type="datetime-local"
              value={endIso}
              onChange={e => setEndIso(e.target.value)}
              min={startIso || minStartLocal}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Candidates (comma separated)</label>
            <input 
              className="form-input" 
              value={candidatesCsv} 
              onChange={e => setCandidatesCsv(e.target.value)} 
              placeholder="Alice,Bob,Charlie"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Merkle root (optional, 0x... or blank)</label>
            <input 
              className="form-input text-mono" 
              value={merkleRoot} 
              onChange={e => setMerkleRoot(e.target.value)} 
              placeholder="0x..."
            />
          </div>

          <div className="mt-6">
            <button type="submit" className="btn btn-primary btn-lg btn-full" disabled={disableCreate}>
              {busy ? "Working..." : (loadingOwner ? "Loading owner..." : (isOwner ? "Create Ballot" : "Owner only"))}
            </button>
          </div>
        </form>
      </div>

      <div className="card mt-6">
        <h4 className="mb-3">Notes:</h4>
        <ul>
          <li>Only the contract owner (deployer) can create ballots.</li>
          <li>If you cancel the MetaMask confirmation, the transaction will not be sent and you'll see a cancellation message.</li>
          <li>Check browser devtools console for detailed diagnostics if something unexpected happens.</li>
        </ul>
      </div>
    </div>
  );
}
