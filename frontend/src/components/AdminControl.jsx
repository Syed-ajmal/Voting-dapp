// src/pages/AdminControl.jsx
import React, { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { getReadOnlyContract, getSignerContract } from "../api/contract";

/**
 * AdminControl.jsx
 *
 * Owner-only admin panel:
 * - Pause / Unpause contract
 * - Finalize a ballot
 * - Update merkle root for a ballot
 * - Extend ballot end time
 *
 * This version avoids loading *all* ballots on mount to prevent RPC rate limits.
 * Instead it loads contract metadata (owner + paused) and provides a search box
 * so the admin can load a single ballot by id on demand.
 */

export default function AdminControl() {
  const { address: connectedAddress, connect } = useWallet();

  const [ownerAddress, setOwnerAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ballots, setBallots] = useState([]); // can contain multiple individually-loaded ballots
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [contractPaused, setContractPaused] = useState(null);

  // inputs per ballot: merkleRoot and newEndIso mapping
  const [merkleInputs, setMerkleInputs] = useState({}); // ballotId -> string
  const [endInputs, setEndInputs] = useState({}); // ballotId -> datetime-local string

  // search input for loading single ballot by id
  const [loadBallotId, setLoadBallotId] = useState("");

  // load owner & paused state only (avoid fetching all ballots)
  useEffect(() => {
    let mounted = true;

    async function loadOwnerAndPause() {
      setLoading(true);
      setStatus(null);
      try {
        const res = await getReadOnlyContract();
        const { contract, url } = res;
        console.debug("[AdminControl] using RPC:", url ?? "unknown");

        // owner
        try {
          const owner = await contract.owner();
          if (mounted) setOwnerAddress(owner);
        } catch (e) {
          if (mounted) setOwnerAddress(null);
        }

        // paused state (if contract exposes paused())
        try {
          const paused = await contract.paused();
          if (mounted) setContractPaused(Boolean(paused));
        } catch (e) {
          console.warn("Could not read paused state:", e);
          if (mounted) setContractPaused(null);
        }

        // do NOT fetch all ballots here (rate-limits). keep ballots empty.
        if (mounted) {
          setBallots([]);
        }
      } catch (err) {
        console.error("loadOwnerAndPause failed", err);
        if (mounted) setStatus("Failed to load contract metadata. Check RPC/config in console.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadOwnerAndPause();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function isOwnerConnected() {
    return ownerAddress && connectedAddress && ownerAddress.toLowerCase() === connectedAddress.toLowerCase();
  }

  function tsToLocal(ts) {
    try {
      return new Date(Number(ts) * 1000).toLocaleString();
    } catch {
      return String(ts);
    }
  }

  // helpers to update inputs
  function setMerkleInput(id, val) {
    setMerkleInputs(prev => ({ ...prev, [id]: val }));
  }
  function setEndInput(id, val) {
    setEndInputs(prev => ({ ...prev, [id]: val }));
  }

  // connect wallet if not connected
  async function ensureConnected() {
    if (!connectedAddress) {
      await connect();
      // brief wait to let WalletContext propagate
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // refresh single ballot data (inserts or updates the ballot in `ballots`)
  async function refreshBallot(ballotId) {
    setStatus(null);
    try {
      const res = await getReadOnlyContract();
      const contract = res.contract;

      const [title, startTsRaw, endTsRaw, merkleRoot, candidateCount_, finalized] = await contract.getBallot(ballotId);
      const candidateCount = Number(candidateCount_);
      const candidateNames = [];
      const votes = [];
      for (let j = 0; j < candidateCount; j++) {
        try {
          const name = await contract.getCandidateName(ballotId, j);
          candidateNames.push(name);
        } catch {
          candidateNames.push("");
        }
        try {
          const v = await contract.getVotes(ballotId, j);
          votes.push(Number(v));
        } catch {
          votes.push(0);
        }
      }

      // insert or update
      setBallots(prev => {
        const updated = prev.map(b => b.id === ballotId ? ({
          id: ballotId,
          title,
          startTs: Number(startTsRaw),
          endTs: Number(endTsRaw),
          merkleRoot,
          candidateCount,
          finalized,
          candidateNames,
          votes,
        }) : b);

        if (!updated.some(b => b.id === ballotId)) {
          updated.push({
            id: ballotId,
            title,
            startTs: Number(startTsRaw),
            endTs: Number(endTsRaw),
            merkleRoot,
            candidateCount,
            finalized,
            candidateNames,
            votes,
          });
        }
        return updated;
      });

      // seed inputs for the loaded ballot
      setMerkleInputs(prev => ({ ...prev, [ballotId]: merkleRoot || "" }));
      try {
        const dIso = new Date(Number(endTsRaw) * 1000).toISOString().slice(0,16);
        setEndInputs(prev => ({ ...prev, [ballotId]: dIso }));
      } catch {}
    } catch (err) {
      console.error("refreshBallot failed", err);
      throw err;
    }
  }

  // action helpers

  async function togglePause() {
    setStatus(null);
    try {
      await ensureConnected();
    } catch (err) {
      setStatus("Wallet connect failed: " + (err?.message || String(err)));
      return;
    }
    if (!isOwnerConnected()) {
      setStatus("Only the contract owner may pause/unpause.");
      return;
    }

    const confirmMsg = contractPaused ? "Unpause contract?" : "Pause contract?";
    if (!window.confirm(confirmMsg)) return;

    setBusy(true);
    setStatus((contractPaused ? "Unpausing" : "Pausing") + " contract — confirm in MetaMask...");
    try {
      const { contract } = await getSignerContract();
      const tx = contractPaused ? await contract.unpause() : await contract.pause();
      setStatus("Transaction submitted: " + tx.hash + " — waiting...");
      await tx.wait();
      setStatus((contractPaused ? "Unpaused" : "Paused") + " successfully.");
      // refresh paused state
      try {
        const res2 = await getReadOnlyContract();
        const paused = await res2.contract.paused();
        setContractPaused(Boolean(paused));
      } catch (_) { /* ignore */ }
    } catch (err) {
      console.error("pause/unpause failed", err);
      const friendly = err?.code === 4001 ? "User cancelled the transaction." : (err?.reason || err?.message || String(err));
      setStatus("Pause/unpause failed: " + friendly);
    } finally {
      setBusy(false);
    }
  }

  async function doFinalize(ballotId) {
    setStatus(null);
    try {
      await ensureConnected();
    } catch (err) {
      setStatus("Wallet connect failed: " + (err?.message || String(err)));
      return;
    }
    if (!isOwnerConnected()) {
      setStatus("Only the contract owner may finalize ballots.");
      return;
    }
    if (!window.confirm(`Finalize ballot ${ballotId}? This action cannot be undone.`)) return;

    setBusy(true);
    setStatus("Sending finalizeBallot tx — confirm in MetaMask...");
    try {
      const { contract } = await getSignerContract();
      const tx = await contract.finalizeBallot(ballotId);
      setStatus("Transaction submitted: " + tx.hash + " — waiting...");
      await tx.wait();
      setStatus("Ballot finalized ✅ Refreshing ballot...");
      await refreshBallot(ballotId);
    } catch (err) {
      console.error("finalizeBallot failed", err);
      setStatus("Finalize failed: " + (err?.code === 4001 ? "User cancelled." : (err?.reason || err?.message || String(err))));
    } finally {
      setBusy(false);
    }
  }

  async function doUpdateMerkle(ballotId) {
    setStatus(null);
    try {
      await ensureConnected();
    } catch (err) {
      setStatus("Wallet connect failed: " + (err?.message || String(err)));
      return;
    }
    if (!isOwnerConnected()) {
      setStatus("Only the contract owner may update merkle roots.");
      return;
    }

    const input = (merkleInputs[ballotId] || "").trim();
    const normalized = (input && input.startsWith("0x") && input.length === 66) ? input : "0x" + "0".repeat(64);

    if (!window.confirm(`Set merkle root for ballot ${ballotId} to ${normalized}?`)) return;

    setBusy(true);
    setStatus("Sending updateMerkleRoot tx — confirm in MetaMask...");
    try {
      const { contract } = await getSignerContract();
      const tx = await contract.updateMerkleRoot(ballotId, normalized);
      setStatus("Transaction submitted: " + tx.hash + " — waiting...");
      await tx.wait();
      setStatus("Merkle root updated ✅ Refreshing ballot...");
      await refreshBallot(ballotId);
    } catch (err) {
      console.error("updateMerkleRoot failed", err);
      setStatus("Update failed: " + (err?.code === 4001 ? "User cancelled." : (err?.reason || err?.message || String(err))));
    } finally {
      setBusy(false);
    }
  }

  async function doExtendEnd(ballotId) {
    setStatus(null);
    try {
      await ensureConnected();
    } catch (err) {
      setStatus("Wallet connect failed: " + (err?.message || String(err)));
      return;
    }
    if (!isOwnerConnected()) {
      setStatus("Only the contract owner may extend ballot end time.");
      return;
    }

    const iso = endInputs[ballotId];
    if (!iso) {
      setStatus("Provide a new end datetime.");
      return;
    }
    const newTs = Math.floor(new Date(iso).getTime() / 1000);
    if (isNaN(newTs)) {
      setStatus("Invalid datetime format.");
      return;
    }

    if (!window.confirm(`Set new end time for ballot ${ballotId} to ${new Date(newTs*1000).toLocaleString()}?`)) return;

    setBusy(true);
    setStatus("Sending extendBallotEnd tx — confirm in MetaMask...");
    try {
      const { contract } = await getSignerContract();
      const tx = await contract.extendBallotEnd(ballotId, newTs);
      setStatus("Transaction submitted: " + tx.hash + " — waiting...");
      await tx.wait();
      setStatus("Ballot end extended ✅ Refreshing ballot...");
      await refreshBallot(ballotId);
    } catch (err) {
      console.error("extendBallotEnd failed", err);
      setStatus("Extend failed: " + (err?.code === 4001 ? "User cancelled." : (err?.reason || err?.message || String(err))));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Admin Control</h1>
        <p className="page-subtitle">Manage contract and ballots (owner only)</p>
      </div>

      <div className="card mb-6">
        <div className="mb-4">
          <div className="mb-2"><strong>Contract owner (RPC):</strong> {loading ? <span className="spinner" style={{ marginLeft: 8 }}></span> : <span className="address">{ownerAddress || "not available"}</span>}</div>
          <div className="mb-2"><strong>Connected wallet:</strong> {connectedAddress ? <span className="address">{connectedAddress}</span> : "not connected"}</div>
          <div className="mb-2"><strong>Contract paused:</strong> {contractPaused === null ? "unknown" : contractPaused ? <span className="badge badge-warning">yes</span> : <span className="badge badge-success">no</span>}</div>
        </div>

        {/* Pause toggle */}
        <div className="mb-4">
          <button 
            className="btn btn-primary btn-sm" 
            onClick={togglePause} 
            disabled={busy || !isOwnerConnected()}
          >
            {busy ? "Working..." : (contractPaused ? "Unpause Contract" : "Pause Contract")}
          </button>
          {!isOwnerConnected() && <span className="status-message status-message-error" style={{ marginLeft: 8, display: "inline-block" }}>Owner only</span>}
        </div>
      </div>

      {status && (
        <div className={`status-message ${status.includes("✅") ? "status-message-success" : "status-message-error"} mb-4`}>
          {status}
        </div>
      )}

      {/* Ballot search/load */}
      <div className="card mb-6">
        <div className="form-group mb-0">
          <div className="flex flex-wrap items-center gap-3">
            <label className="form-label mb-0">
              Load ballot ID&nbsp;
              <input
                className="form-input"
                type="number"
                value={loadBallotId}
                onChange={(e) => setLoadBallotId(e.target.value)}
                style={{ width: 120 }}
                placeholder="e.g. 0"
              />
            </label>
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                setStatus("Loading ballot...");
                try {
                  const id = Number(loadBallotId);
                  if (isNaN(id)) throw new Error("Provide a numeric ballot id");
                  await refreshBallot(id);
                  setStatus(null);
                } catch (err) {
                  console.error("Load ballot failed", err);
                  setStatus("Failed to load ballot: " + (err?.message || String(err)));
                }
              }}
              disabled={busy}
            >
              Load Ballot
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setBallots([]);
                setLoadBallotId("");
                setStatus(null);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="card">
          <div className="flex items-center justify-center gap-3">
            <span className="spinner"></span>
            <span>Loading contract metadata...</span>
          </div>
        </div>
      ) : ballots.length === 0 ? (
        <div className="card">
          <p className="text-center">No ballot loaded. Use the search box above to load one ballot by id.</p>
        </div>
      ) : (
        <div>
          {ballots.map(b => (
            <div key={b.id} className="card mb-6">
              <div className="card-header">
                <h2 className="card-title">[{b.id}] {b.title}</h2>
                <div className="text-sm">
                  {tsToLocal(b.startTs)} → {tsToLocal(b.endTs)} {b.finalized && <span className="badge badge-success">Finalized</span>}
                </div>
              </div>

              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Merkle root</label>
                  <div className="flex gap-3 flex-wrap items-end">
                    <input
                      className="form-input text-mono"
                      value={merkleInputs[b.id] ?? (b.merkleRoot || "")}
                      onChange={e => setMerkleInput(b.id, e.target.value)}
                      placeholder="0x... or leave blank to clear"
                      style={{ flex: 1, minWidth: 200 }}
                      disabled={!isOwnerConnected() || busy}
                    />
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => doUpdateMerkle(b.id)} 
                      disabled={!isOwnerConnected() || busy}
                    >
                      Update Merkle Root
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Extend end time</label>
                  <div className="flex gap-3 flex-wrap items-end">
                    <input
                      className="form-input"
                      type="datetime-local"
                      value={endInputs[b.id] ?? ""}
                      onChange={e => setEndInput(b.id, e.target.value)}
                      disabled={!isOwnerConnected() || busy}
                      style={{ flex: 1, minWidth: 200 }}
                    />
                    <button 
                      className="btn btn-secondary btn-sm" 
                      onClick={() => doExtendEnd(b.id)} 
                      disabled={!isOwnerConnected() || busy}
                    >
                      Extend End
                    </button>
                  </div>
                </div>

                <div className="mb-4">
                  <h4 className="mb-3">Candidates & Votes</h4>
                  <div className="candidate-list">
                    {b.candidateNames.map((n, idx) => (
                      <div key={idx} className="candidate-item">
                        <span style={{ flex: 1 }}>{n}</span>
                        <span className="vote-count">{b.votes && b.votes[idx] != null ? b.votes[idx] : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="card-footer">
                <div className="flex gap-3 flex-wrap">
                  <button 
                    className="btn btn-primary btn-sm" 
                    onClick={() => doFinalize(b.id)} 
                    disabled={!isOwnerConnected() || busy || b.finalized}
                  >
                    Finalize Ballot
                  </button>
                  <button 
                    className="btn btn-secondary btn-sm" 
                    onClick={() => refreshBallot(b.id)} 
                    disabled={busy}
                  >
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
