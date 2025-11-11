// src/pages/Results.jsx
import React, { useEffect, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { getReadOnlyContract, getSignerContract } from "../api/contract";

/**
 * Results.jsx
 * - Lists ballots
 * - Shows candidate vote counts for selected ballot
 * - If finalized, shows winners (supports ties)
 * - If not finalized and connected account is owner, shows a Finalize button (owner-only)
 */

export default function Results() {
  const { address: connectedAddress, connect } = useWallet();

  const [loading, setLoading] = useState(true);
  const [ballots, setBallots] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ownersAddress, setOwnersAddress] = useState(null);

  // load ballots and owner on mount
  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      setLoading(true);
      setStatus(null);
      try {
        const { contract } = getReadOnlyContract();
        // owner (for owner-only actions)
        try {
          const owner = await contract.owner();
          if (mounted) setOwnersAddress(owner);
        } catch (e) {
          if (mounted) setOwnersAddress(null);
        }

        const nextIdRaw = await contract.nextBallotId();
        const nextId = Number(nextIdRaw || 0);
        const list = [];

        for (let i = 0; i < nextId; i++) {
          try {
            const [title, startTsRaw, endTsRaw, merkleRoot, candidateCount_, finalized] = await contract.getBallot(i);
            const startTs = Number(startTsRaw);
            const endTs = Number(endTsRaw);
            const candidateCount = Number(candidateCount_);
            const candidateNames = [];
            const votes = [];

            for (let j = 0; j < candidateCount; j++) {
              const name = await contract.getCandidateName(i, j);
              candidateNames.push(name);
              try {
                const v = await contract.getVotes(i, j);
                votes.push(Number(v));
              } catch (vErr) {
                votes.push(0);
              }
            }

            list.push({
              id: i,
              title,
              startTs,
              endTs,
              merkleRoot,
              candidateCount,
              finalized,
              candidateNames,
              votes,
            });
          } catch (innerErr) {
            console.warn("Skipping reading ballot", i, innerErr);
          }
        }

        if (mounted) {
          setBallots(list);
          if (list.length > 0 && selectedId === null) setSelectedId(list[0].id);
        }
      } catch (err) {
        console.error("loadAll error", err);
        if (mounted) setStatus("Failed to load ballots. Check RPC/config in console.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAll();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // helper to get selected ballot
  const selected = ballots.find(b => b.id === selectedId) || null;

  // friendly error messages
  function friendlyErrorMessage(err) {
    if (!err) return "Unknown error";
    if (err.code === 4001) return "Action cancelled by user (MetaMask).";
    const msg = err?.reason || err?.data?.message || err?.message || String(err);
    if (msg.toLowerCase().includes("revert")) return "Contract reverted: " + msg;
    return msg;
  }

  // refresh single ballot data (by id)
  async function refreshBallot(id) {
    setStatus(null);
    try {
      const { contract } = getReadOnlyContract();
      const [title, startTsRaw, endTsRaw, merkleRoot, candidateCount_, finalized] = await contract.getBallot(id);
      const candidateCount = Number(candidateCount_);
      const candidateNames = [];
      const votes = [];
      for (let j = 0; j < candidateCount; j++) {
        const name = await contract.getCandidateName(id, j);
        candidateNames.push(name);
        try {
          const v = await contract.getVotes(id, j);
          votes.push(Number(v));
        } catch (vErr) {
          votes.push(0);
        }
      }

      setBallots(prev => prev.map(b => b.id === id ? ({
        id,
        title,
        startTs: Number(startTsRaw),
        endTs: Number(endTsRaw),
        merkleRoot,
        candidateCount,
        finalized,
        candidateNames,
        votes,
      }) : b));
    } catch (err) {
      console.error("refreshBallot failed", err);
      setStatus("Failed to refresh ballot. See console for details.");
    }
  }

  // show winners for selected ballot (calls getWinners)
  async function loadWinners(id) {
    setStatus(null);
    try {
      const { contract } = getReadOnlyContract();
      const [names, winningVotes] = await contract.getWinners(id);
      return { names: names || [], winningVotes: Number(winningVotes || 0) };
    } catch (err) {
      console.error("getWinners failed", err);
      return { error: friendlyErrorMessage(err) };
    }
  }

  // finalize ballot (owner-only) — prompts MetaMask
  async function finalizeBallot(id) {
    setStatus(null);

    // ensure connected
    if (!connectedAddress) {
      try {
        await connect();
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        setStatus("Wallet connect failed: " + friendlyErrorMessage(err));
        return;
      }
    }

    if (!ownersAddress) {
      setStatus("Contract owner unknown — cannot finalize from UI.");
      return;
    }
    if (ownersAddress.toLowerCase() !== (connectedAddress || "").toLowerCase()) {
      setStatus("Only contract owner may finalize ballots.");
      return;
    }

    // confirm with user
    const ok = window.confirm("Finalize ballot? This will lock results (finalizeBallot). Proceed?");
    if (!ok) return;

    setBusy(true);
    setStatus("Sending finalize transaction — confirm in MetaMask...");
    try {
      const { contract } = await getSignerContract();
      const tx = await contract.finalizeBallot(id);
      setStatus("Transaction submitted: " + tx.hash + " — waiting for confirmation...");
      await tx.wait();
      setStatus("Ballot finalized ✅ Refreshing...");
      await refreshBallot(id);
    } catch (err) {
      console.error("finalizeBallot failed", err);
      setStatus("Finalize failed: " + friendlyErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function tsToLocal(ts) {
    try {
      const d = new Date(Number(ts) * 1000);
      return d.toLocaleString();
    } catch {
      return String(ts);
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <h2>Results</h2>

      {status && <div style={{ marginBottom: 8, color: "darkred" }}>{status}</div>}

      {loading ? (
        <div>Loading ballots...</div>
      ) : ballots.length === 0 ? (
        <div>No ballots found.</div>
      ) : (
        <div style={{ display: "flex", gap: 24 }}>
          <div style={{ minWidth: 300 }}>
            <h3>Ballots</h3>
            <ul>
              {ballots.map(b => (
                <li key={b.id} style={{ marginBottom: 6 }}>
                  <button
                    onClick={() => {
                      setSelectedId(b.id);
                      setStatus(null);
                    }}
                    style={{ fontWeight: b.id === selectedId ? "bold" : "normal" }}
                  >
                    [{b.id}] {b.title}
                  </button>
                  <div style={{ fontSize: 12, color: "#666" }}>
                    {tsToLocal(b.startTs)} → {tsToLocal(b.endTs)} {b.finalized ? "(finalized)" : ""}
                  </div>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 8 }}>
              <button onClick={async () => {
                setStatus("Refreshing...");
                try {
                  // simple full reload of data
                  const { contract } = getReadOnlyContract();
                  const nextIdRaw = await contract.nextBallotId();
                  const nextId = Number(nextIdRaw || 0);
                  // naive approach: reload page to re-run effects
                  window.location.reload();
                } catch (err) {
                  console.error("refresh all failed", err);
                  setStatus("Refresh failed; see console.");
                }
              }}>Refresh All</button>
            </div>
          </div>

          <div style={{ flex: 1 }}>
            <h3>Selected</h3>
            {!selected ? (
              <div>Select a ballot to view results.</div>
            ) : (
              <div>
                <div><strong>{selected.title}</strong></div>
                <div style={{ fontSize: 13, color: "#444", marginBottom: 8 }}>
                  {tsToLocal(selected.startTs)} → {tsToLocal(selected.endTs)} {selected.finalized ? "(finalized)" : "(not finalized)"}
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
                      <button onClick={async () => {
                        setStatus("Loading winners...");
                        const res = await loadWinners(selected.id);
                        if (res?.error) {
                          setStatus("Failed to load winners: " + res.error);
                        } else {
                          const names = res.names || [];
                          const votes = res.winningVotes;
                          setStatus(`Winner(s): ${names.join(", ")} (votes: ${votes})`);
                        }
                      }}>Show winners</button>
                      <button onClick={() => refreshBallot(selected.id)} style={{ marginLeft: 8 }}>Refresh</button>
                    </div>
                  ) : (
                    <div>
                      <div style={{ marginBottom: 8, color: "#777" }}>This ballot has not been finalized yet.</div>

                      {ownersAddress && ownersAddress.toLowerCase() === (connectedAddress || "").toLowerCase() ? (
                        <div>
                          <button onClick={() => finalizeBallot(selected.id)} disabled={busy}>
                            {busy ? "Finalizing..." : "Finalize ballot (owner only)"}
                          </button>
                          <button onClick={() => refreshBallot(selected.id)} style={{ marginLeft: 8 }}>Refresh</button>
                        </div>
                      ) : (
                        <div>
                          <button onClick={() => refreshBallot(selected.id)}>Refresh</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
