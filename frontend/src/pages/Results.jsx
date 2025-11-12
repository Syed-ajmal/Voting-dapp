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
    try {
      const { contract } = await getReadOnlyContract();
      const res = await contract.getWinners(id);
      const names = res[0] || [];
      const winningVotes = Number(res[1] || 0);
      setStatus(`Winner(s): ${names.join(", ")} (votes: ${winningVotes})`);
    } catch (err) {
      console.error("getWinners failed", err);
      setStatus("Failed to load winners: " + friendlyErrorMessage(err));
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
    <div style={{ padding: 12 }}>
      <h2>Results (search)</h2>

      <div style={{ marginBottom: 12 }}>
        <div><strong>Contract owner (RPC):</strong> {loadingOwner ? "loading..." : (ownersAddress || "not available")}</div>
        <div><strong>Contract paused:</strong> {contractPaused === null ? "unknown" : contractPaused ? "yes" : "no"}</div>
        <div><strong>Connected wallet:</strong> {connectedAddress || "not connected"}</div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label>Ballot ID&nbsp;
          <input
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            style={{ width: 120, marginRight: 8 }}
          />
        </label>
        <button onClick={() => loadBallotById(searchId)} disabled={loadingBallot}>
          {loadingBallot ? "Loading..." : "Load Ballot"}
        </button>
        <button onClick={() => { setSearchId(""); setSelected(null); setStatus(null); }} style={{ marginLeft: 8 }}>Clear</button>
      </div>

      {status && <div style={{ marginBottom: 8, color: "darkred" }}>{status}</div>}

      {!selected ? (
        <div>No ballot loaded. Use the search box above to load one ballot by id.</div>
      ) : (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>[{selected.id}] {selected.title}</strong>
            <div style={{ fontSize: 13, color: "#555" }}>
              {tsToLocal(selected.startTs)} → {tsToLocal(selected.endTs)} {selected.finalized ? "(finalized)" : "(not finalized)"}
              {selected.paused && <span style={{ color: "orange", marginLeft: 12 }}>Contract paused</span>}
            </div>
          </div>

          <div>
            <h4>Candidates & votes</h4>
            <ul>
              {selected.candidateNames.map((n, idx) => (
                <li key={idx}>
                  {n} — {selected.votes && selected.votes[idx] != null ? selected.votes[idx] : "—"}
                </li>
              ))}
            </ul>
          </div>

          <div style={{ marginTop: 12 }}>
            {selected.finalized ? (
              <div>
                <button onClick={() => loadWinners(selected.id)}>Show winners</button>
                <button onClick={refreshSelected} style={{ marginLeft: 8 }}>Refresh</button>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: 8, color: "#777" }}>This ballot has not been finalized yet.</div>
                {ownersAddress && ownersAddress.toLowerCase() === (connectedAddress || "").toLowerCase() ? (
                  <div>
                    <button onClick={() => finalizeBallot(selected.id)} disabled={busy}>{busy ? "Finalizing..." : "Finalize ballot (owner only)"}</button>
                    <button onClick={refreshSelected} style={{ marginLeft: 8 }}>Refresh</button>
                  </div>
                ) : (
                  <div>
                    <button onClick={refreshSelected}>Refresh</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
