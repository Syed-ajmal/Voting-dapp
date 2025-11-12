// src/components/BallotList.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as contractApi from "../api/contract";

/**
 * BallotList (search-by-id)
 *
 * Does NOT auto-load all ballots. Instead provides a search box to load a single
 * ballot by id on demand (avoids RPC rate-limit / Too Many Requests errors).
 *
 * Keeps compatibility with contractApi.getReadOnlyContract() or default export.
 */

export default function BallotList({ compact = false, onSelect }) {
  const [loading, setLoading] = useState(false);
  const [ballots, setBallots] = useState([]); // individually-loaded ballots
  const [error, setError] = useState(null);
  const [idInput, setIdInput] = useState("");
  const navigate = useNavigate();

  function resolveReadOnlyInit() {
    if (typeof contractApi.getReadOnlyContract === "function") return contractApi.getReadOnlyContract;
    if (typeof contractApi.default === "function") return contractApi.default;
    throw new Error("No read-only contract initializer found. Export getReadOnlyContract or default from src/api/contract.");
  }

  async function loadBallotById(rawId) {
    setError(null);
    setLoading(true);
    try {
      const id = Number(rawId);
      if (isNaN(id) || id < 0) throw new Error("Provide a valid numeric ballot id");

      const readFn = resolveReadOnlyInit();
      const ro = await readFn();
      const contract = ro?.contract || ro;
      if (!contract || typeof contract.getBallot !== "function") {
        throw new Error("Read-only contract instance not available");
      }

      const res = await contract.getBallot(id);
      const title = res[0];
      const startTs = Number(res[1] || 0);
      const endTs = Number(res[2] || 0);
      const merkleRoot = res[3];
      const candidateCount = Number(res[4] || 0);
      const finalized = Boolean(res[5]);

      const candidateNames = [];
      for (let j = 0; j < candidateCount; j++) {
        try {
          const name = await contract.getCandidateName(id, j);
          candidateNames.push(name);
        } catch (e) {
          candidateNames.push("");
        }
      }

      // insert or update
      setBallots(prev => {
        const exists = prev.some(b => b.id === id);
        const entry = { id, title, startTs, endTs, merkleRoot, candidateCount, finalized, candidateNames };
        return exists ? prev.map(b => b.id === id ? entry : b) : [...prev, entry];
      });
    } catch (err) {
      console.error("loadBallotById error", err);
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  function goToVote(id) {
    navigate("/vote", { state: { ballotId: id } });
  }
  function goToResults(id) {
    if (onSelect) onSelect(id); else navigate("/results", { state: { ballotId: id } });
  }

  function tsToLocal(ts) {
    try { return new Date(Number(ts) * 1000).toLocaleString(); } catch { return String(ts); }
  }

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <label>
          Ballot ID&nbsp;
          <input
            value={idInput}
            onChange={e => setIdInput(e.target.value)}
            style={{ width: 120 }}
            placeholder="e.g. 0"
          />
        </label>
        <button onClick={() => loadBallotById(idInput)} style={{ marginLeft: 8 }} disabled={loading}>
          {loading ? "Loading..." : "Load Ballot"}
        </button>
        <button onClick={() => { setBallots([]); setIdInput(""); setError(null); }} style={{ marginLeft: 8 }}>
          Clear
        </button>
      </div>

      {error && <div style={{ color: "red", marginBottom: 8 }}>{error}</div>}

      {ballots.length === 0 ? (
        <div>No ballot loaded. Use the search box above to load one ballot by id.</div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {ballots.map(b => (
            <li key={b.id} style={{ borderBottom: "1px solid #eee", padding: "8px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ minWidth: 60 }}>
                  <strong>[{b.id}]</strong>
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{b.title || "(no title)"}</div>
                  <div style={{ fontSize: 13, color: "#555" }}>
                    {tsToLocal(b.startTs)} → {tsToLocal(b.endTs)} {b.finalized ? "(finalized)" : ""}
                  </div>
                  {!compact && <div style={{ marginTop: 6, fontSize: 13 }}>Candidates: {b.candidateNames.join(", ")}</div>}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => goToResults(b.id)}>View</button>
                  <button onClick={() => goToVote(b.id)}>Vote</button>
                  <button onClick={() => loadBallotById(b.id)}>Refresh</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
