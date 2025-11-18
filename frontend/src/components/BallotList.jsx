// src/components/BallotList.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import * as contractApi from "../api/contract";
import { isBallotNotFoundError } from "../utils/errors";

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
      setError(isBallotNotFoundError(err) ? "No ballot found." : (err?.message || String(err)));
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
      <div className="form-group mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <label className="form-label mb-0">
            Ballot ID&nbsp;
            <input
              className="form-input"
              value={idInput}
              onChange={e => setIdInput(e.target.value)}
              style={{ width: 120 }}
              placeholder="e.g. 0"
            />
          </label>
          <button 
            className="btn btn-primary btn-sm" 
            onClick={() => loadBallotById(idInput)} 
            disabled={loading}
          >
            {loading ? <><span className="spinner" style={{ marginRight: 8 }}></span>Loading...</> : "Load Ballot"}
          </button>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={() => { setBallots([]); setIdInput(""); setError(null); }}
          >
            Clear
          </button>
        </div>
      </div>

      {error && <div className="status-message status-message-error mb-4">{error}</div>}

      {ballots.length === 0 ? (
        <div className="card">
          <p className="text-center">No ballot loaded. Use the search box above to load one ballot by id.</p>
        </div>
      ) : (
        <div>
          {ballots.map(b => (
            <div key={b.id} className="card mb-4">
              <div className="flex items-center gap-4 flex-wrap">
                <div className="ballot-id">[{b.id}]</div>

                <div style={{ flex: 1, minWidth: 200 }}>
                  <h3 className="card-title" style={{ marginBottom: 8 }}>{b.title || "(no title)"}</h3>
                  <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
                    {tsToLocal(b.startTs)} → {tsToLocal(b.endTs)} {b.finalized && <span className="badge badge-success">Finalized</span>}
                  </div>
                  {!compact && (
                    <div className="text-sm mt-2">
                      <strong>Candidates:</strong> {b.candidateNames.join(", ")}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button className="btn btn-secondary btn-sm" onClick={() => goToResults(b.id)}>View</button>
                  <button className="btn btn-primary btn-sm" onClick={() => goToVote(b.id)}>Vote</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => loadBallotById(b.id)}>Refresh</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
