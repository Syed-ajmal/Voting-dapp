// src/components/BallotList.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as contractApi from "../api/contract";

/**
 * BallotList (fixed)
 *
 * Uses the actual exports from src/api/contract:
 *  - getReadOnlyContract()  OR default export that returns { contract, provider }
 *
 * Renders list of ballots with View / Vote / Refresh buttons.
 */
export default function BallotList({ compact = false, onSelect }) {
  const [loading, setLoading] = useState(true);
  const [ballots, setBallots] = useState([]);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Resolve a read-only initializer function from contractApi
  function resolveReadOnlyInit() {
    if (typeof contractApi.getReadOnlyContract === "function") return contractApi.getReadOnlyContract;
    if (typeof contractApi.default === "function") return contractApi.default;
    throw new Error("No read-only contract initializer found. Export getReadOnlyContract or default from src/api/contract.");
  }

  useEffect(() => {
    let mounted = true;

    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        const readFn = resolveReadOnlyInit();
        // some implementations expect an arg, some don't — call without args first
        let ro = await readFn();
        // if the default export returns the contract directly, coerce it
        const contract = (ro && ro.contract) ? ro.contract : ro;

        if (!contract || typeof contract.nextBallotId !== "function") {
          throw new Error("Read-only contract instance not available or missing nextBallotId()");
        }

        const nextIdRaw = await contract.nextBallotId();
        const nextId = Number(nextIdRaw || 0);

        const list = [];
        for (let i = 0; i < nextId; i++) {
          try {
            const res = await contract.getBallot(i);
            const title = res[0];
            const startTs = Number(res[1] || 0);
            const endTs = Number(res[2] || 0);
            const merkleRoot = res[3];
            const candidateCount = Number(res[4] || 0);
            const finalized = Boolean(res[5]);

            const candidateNames = [];
            for (let j = 0; j < candidateCount; j++) {
              try {
                const name = await contract.getCandidateName(i, j);
                candidateNames.push(name);
              } catch (e) {
                candidateNames.push("");
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
            });
          } catch (inner) {
            console.warn("Failed to read ballot", i, inner);
          }
        }

        if (mounted) setBallots(list);
      } catch (err) {
        console.error("BallotList loadAll error:", err);
        if (mounted) setError(String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAll();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function goToVote(id) {
    navigate("/vote", { state: { ballotId: id } });
  }
  function goToResults(id) {
    navigate("/results", { state: { ballotId: id } });
  }

  function tsToLocal(ts) {
    try {
      return new Date(Number(ts) * 1000).toLocaleString();
    } catch {
      return String(ts);
    }
  }

  if (loading) return <div>Loading ballots...</div>;
  if (error) return <div style={{ color: "red" }}>Failed to load ballots: {error}</div>;
  if (!ballots.length) return <div>No ballots found.</div>;

  return (
    <div>
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

                {!compact && (
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    Candidates: {b.candidateNames && b.candidateNames.length ? b.candidateNames.join(", ") : b.candidateCount}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => { if (onSelect) onSelect(b.id); else goToResults(b.id); }}>
                  View
                </button>

                <button onClick={() => goToVote(b.id)}>
                  Vote
                </button>

                <button onClick={() => {
                  // refresh: reload component by reloading the page (simple, reliable)
                  window.location.reload();
                }}>
                  Refresh
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
