// src/pages/Results.jsx
import React, { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { getReadOnlyContract, getSignerContract } from "../api/contract";

/**
 * Results.jsx (search-first)
 * - Does NOT enumerate all ballots on mount.
 * - Loads owner and paused state only (cheap).
 * - Provides search input to load a single ballot by id.
 * - Supports finalize (owner-only) and show winners.
 */

export default function Results() {
  const { address: connectedAddress, connect } = useWallet();

  const [loadingOwner, setLoadingOwner] = useState(true);
  const [ownersAddress, setOwnersAddress] = useState(null);
  const [contractPaused, setContractPaused] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);

  // search / loaded ballot state
  const [searchId, setSearchId] = useState("");
  const [selected, setSelected] = useState(null); // { id, title, startTs, endTs, merkleRoot, candidateNames[], votes[], finalized, paused }
  const [loadingBallot, setLoadingBallot] = useState(false);
  const [winners, setWinners] = useState(null); // { ballotId, names[], winningVotes }

  // load owner + paused state once on mount (cheap)
  useEffect(() => {
    let mounted = true;
    async function init() {
      setLoadingOwner(true);
      setStatus(null);
      try {
        const { contract } = await getReadOnlyContract();
        try {
          const owner = await contract.owner();
          if (mounted) setOwnersAddress(owner);
        } catch (e) {
          if (mounted) setOwnersAddress(null);
        }
        try {
          const paused = await contract.paused();
          if (mounted) setContractPaused(Boolean(paused));
        } catch (e) {
          if (mounted) setContractPaused(null);
        }
      } catch (err) {
        console.error("init results failed", err);
        if (mounted) setStatus("Failed to initialize contract info. Check RPC / config.");
      } finally {
        if (mounted) setLoadingOwner(false);
      }
    }
    init();
    return () => (mounted = false);
  }, []);

  function friendlyErrorMessage(err) {
    if (!err) return "Unknown error";
    if (err.code === 4001) return "Action cancelled by user (MetaMask).";
    const msg = err?.reason || err?.data?.message || err?.message || String(err);
    if (msg.toLowerCase().includes("revert")) return "Contract reverted: " + msg;
    return msg;
  }

  // load a single ballot by id
  async function loadBallotById(idRaw) {
    setStatus(null);
    setSelected(null);
    setLoadingBallot(true);

    try {
      if (idRaw === "" || idRaw == null || isNaN(Number(idRaw))) {
        setStatus("Enter a numeric ballot id.");
        return;
      }
      const id = Number(idRaw);

      const { contract } = await getReadOnlyContract();
      const res = await contract.getBallot(id);
      if (!res) {
        setStatus("Ballot not found (empty result).");
        return;
      }
      const title = res[0] || "";
      const startTs = Number(res[1] || 0);
      const endTs = Number(res[2] || 0);
      const merkleRoot = res[3] || "0x" + "0".repeat(64);
      const candidateCount = Number(res[4] || 0);
      const finalized = Boolean(res[5]);

      const candidateNames = [];
      const votes = [];
      // sequential read to avoid huge parallel RPC load
      for (let j = 0; j < candidateCount; j++) {
        try {
          const nm = await contract.getCandidateName(id, j);
          candidateNames.push(nm);
        } catch (e) {
          candidateNames.push("");
        }
        try {
          const v = await contract.getVotes(id, j);
          votes.push(Number(v));
        } catch (e) {
          votes.push(0);
        }
      }

      // refresh paused state if available
      let paused = contractPaused;
      try {
        const p = await contract.paused();
        paused = Boolean(p);
        setContractPaused(paused);
      } catch {
        // ignore if not available
      }

      setSelected({
        id,
        title,
        startTs,
        endTs,
        merkleRoot,
        candidateCount,
        finalized,
        candidateNames,
        votes,
        paused,
      });
    } catch (err) {
      console.error("Failed to load ballot:", err);
      setStatus("Failed to load ballot: " + (err?.message || String(err)));
    } finally {
      setLoadingBallot(false);
    }
  }

  // show winners for selected ballot (calls getWinners)
  async function loadWinners(id) {
    setStatus(null);
    setWinners(null);
    try {
      const { contract } = await getReadOnlyContract();
      const res = await contract.getWinners(id);
      const names = res[0] || [];
      const winningVotes = Number(res[1] || 0);
      setWinners({
        ballotId: id,
        names: names,
        winningVotes: winningVotes
      });
    } catch (err) {
      console.error("getWinners failed", err);
      setStatus("Failed to load winners: " + friendlyErrorMessage(err));
      setWinners(null);
    }
  }

  // finalize ballot (owner-only)
  async function finalizeBallot(id) {
    setStatus(null);

    if (!connectedAddress) {
      try {
        await connect();
        await new Promise((r) => setTimeout(r, 200));
      } catch (err) {
        setStatus("Wallet connect failed: " + friendlyErrorMessage(err));
        return;
      }
    }

    if (!ownersAddress) {
      setStatus("Contract owner unknown; cannot finalize.");
      return;
    }
    if ((connectedAddress || "").toLowerCase() !== (ownersAddress || "").toLowerCase()) {
      setStatus("Only contract owner may finalize ballots.");
      return;
    }

    if (!window.confirm(`Finalize ballot ${id}? This locks results.`)) return;

    setBusy(true);
    setStatus("Sending finalize tx — confirm in MetaMask...");
    try {
      const { contract } = await getSignerContract();
      const tx = await contract.finalizeBallot(id);
      setStatus("Transaction submitted: " + tx.hash + " — waiting...");
      await tx.wait();
      setStatus("Ballot finalized ✅ Refreshing...");
      await loadBallotById(id);
    } catch (err) {
      console.error("finalizeBallot failed", err);
      setStatus("Finalize failed: " + friendlyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function refreshSelected() {
    if (!selected) {
      setStatus("No ballot selected to refresh.");
      return;
    }
    await loadBallotById(selected.id);
  }

  function tsToLocal(ts) {
    try {
      return new Date(Number(ts) * 1000).toLocaleString();
    } catch {
      return String(ts);
    }
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Results</h1>
        <p className="page-subtitle">View voting results and finalize ballots</p>
      </div>

      <div className="card mb-6">
        <div className="mb-4">
          <div className="mb-2"><strong>Contract owner (RPC):</strong> {loadingOwner ? <span className="spinner" style={{ marginLeft: 8 }}></span> : <span className="address">{ownersAddress || "not available"}</span>}</div>
          <div className="mb-2"><strong>Contract paused:</strong> {contractPaused === null ? "unknown" : contractPaused ? <span className="badge badge-warning">yes</span> : <span className="badge badge-success">no</span>}</div>
          <div className="mb-2"><strong>Connected wallet:</strong> {connectedAddress ? <span className="address">{connectedAddress}</span> : "not connected"}</div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="form-group mb-0">
          <div className="flex flex-wrap items-center gap-3">
            <label className="form-label mb-0">
              Ballot ID&nbsp;
              <input
                className="form-input"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                style={{ width: 120 }}
              />
            </label>
            <button 
              className="btn btn-primary btn-sm" 
              onClick={() => loadBallotById(searchId)} 
              disabled={loadingBallot}
            >
              {loadingBallot ? <><span className="spinner" style={{ marginRight: 8 }}></span>Loading...</> : "Load Ballot"}
            </button>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => { 
                setSearchId(""); 
                setSelected(null); 
                setStatus(null); 
                setWinners(null);
              }}
            >
              Clear
            </button>
          </div>
        </div>
      </div>

      {status && !status.includes("Winner") && (
        <div className={`status-message ${status.includes("✅") ? "status-message-success" : "status-message-error"} mb-4`}>
          {status}
        </div>
      )}

      {winners && (
        <div className="card mb-6 winner-card">
          <div className="card-header">
            <h3 className="card-title winner-title">
              🏆 Winner Results
            </h3>
          </div>
          <div className="card-body">
            <div className="mb-3">
              <div className="mb-2">
                <strong>Ballot ID:</strong> <span className="ballot-id">[{winners.ballotId}]</span>
              </div>
              {selected && (
                <div className="mb-2">
                  <strong>Ballot Title:</strong> {selected.title}
                </div>
              )}
            </div>
            <div className="mb-3">
              <strong>Winner(s):</strong>
              <div className="mt-2 winner-names">
                {winners.names.length > 0 ? (
                  winners.names.map((name, idx) => (
                    <span key={idx} className="badge badge-success winner-badge">
                      {name}
                    </span>
                  ))
                ) : (
                  <span className="text-sm">No winners found</span>
                )}
              </div>
            </div>
            <div>
              <strong>Winning Votes:</strong> <span className="vote-count">{winners.winningVotes}</span>
            </div>
          </div>
          <div className="card-footer">
            <button 
              className="btn btn-secondary btn-sm" 
              onClick={() => setWinners(null)}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {!selected ? (
        <div className="card">
          <p className="text-center">No ballot loaded. Use the search box above to load one ballot by id.</p>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">[{selected.id}] {selected.title}</h2>
            <div className="text-sm mb-2">
              {tsToLocal(selected.startTs)} → {tsToLocal(selected.endTs)} {selected.finalized ? <span className="badge badge-success">Finalized</span> : <span className="badge">Not finalized</span>}
              {selected.paused && <span className="badge badge-warning" style={{ marginLeft: 8 }}>Contract paused</span>}
            </div>
          </div>

          <div className="card-body">
            <h4 className="mb-4">Candidates & Votes</h4>
            <div className="candidate-list">
              {selected.candidateNames.map((n, idx) => (
                <div key={idx} className="candidate-item">
                  <span style={{ flex: 1 }}>{n}</span>
                  <span className="vote-count">{selected.votes && selected.votes[idx] != null ? selected.votes[idx] : "—"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card-footer">
            {selected.finalized ? (
              <div className="flex gap-3 flex-wrap">
                <button className="btn btn-primary btn-sm" onClick={() => loadWinners(selected.id)}>Show Winners</button>
                <button className="btn btn-secondary btn-sm" onClick={refreshSelected}>Refresh</button>
              </div>
            ) : (
              <div>
                <div className="text-sm mb-4">This ballot has not been finalized yet.</div>
                {ownersAddress && ownersAddress.toLowerCase() === (connectedAddress || "").toLowerCase() ? (
                  <div className="flex gap-3 flex-wrap">
                    <button className="btn btn-primary btn-sm" onClick={() => finalizeBallot(selected.id)} disabled={busy}>
                      {busy ? "Finalizing..." : "Finalize Ballot (Owner Only)"}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={refreshSelected}>Refresh</button>
                  </div>
                ) : (
                  <button className="btn btn-secondary btn-sm" onClick={refreshSelected}>Refresh</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
