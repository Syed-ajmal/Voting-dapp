// src/pages/Vote.jsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import * as contractApi from "../api/contract";

/**
 * Vote page
 * - Reads ballot info via read-only contract helper.
 * - Sends vote via signer contract helper.
 * This version prefers the actual exported names getReadOnlyContract/getSignerContract
 * but also tolerates a default export for read-only if that's present.
 */

export default function Vote() {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { address: connectedAddress, connect } = useWallet();

  const [ballotIdInput, setBallotIdInput] = useState(state?.ballotId ?? "");
  const [loading, setLoading] = useState(false);
  const [ballot, setBallot] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState("");
  const [merkleRoot, setMerkleRoot] = useState("");
  const [merkleProofText, setMerkleProofText] = useState("");
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [userHasVoted, setUserHasVoted] = useState(false);
  const [isPaused, setIsPaused] = useState(null);

  // Prefer the actual exported functions in src/api/contract
  function resolveReadOnlyInit() {
    if (typeof contractApi.getReadOnlyContract === "function") return contractApi.getReadOnlyContract;
    if (typeof contractApi.default === "function") return contractApi.default;
    throw new Error("No read-only contract initializer found in src/api/contract.");
  }
  function resolveSignerInit() {
    if (typeof contractApi.getSignerContract === "function") return contractApi.getSignerContract;
    throw new Error("No signer contract initializer found in src/api/contract.");
  }

  async function loadBallotById(id) {
    setStatus(null);
    setLoading(true);
    setBallot(null);
    setCandidates([]);
    setSelectedCandidate("");
    setUserHasVoted(false);

    try {
      if (id === "" || id === null || isNaN(Number(id))) {
        setStatus("Provide a numeric ballot id.");
        return;
      }

      const readFn = resolveReadOnlyInit();
      const ro = await readFn();
      const contract = ro?.contract || ro;
      if (!contract || typeof contract.getBallot !== "function") {
        throw new Error("Read-only contract not available.");
      }

      const res = await contract.getBallot(Number(id));
      const title = res[0];
      const start = Number(res[1] || 0);
      const end = Number(res[2] || 0);
      const root = res[3] || "0x" + "0".repeat(64);
      const candidateCount = Number(res[4] || 0);
      const finalized = Boolean(res[5]);

      const names = [];
      for (let i = 0; i < candidateCount; i++) {
        try {
          const nm = await contract.getCandidateName(Number(id), i);
          names.push(nm);
        } catch {
          names.push("");
        }
      }

      let paused = null;
      try {
        const p = await contract.paused();
        paused = Boolean(p);
      } catch {
        paused = null;
      }

      setBallot({ id: Number(id), title, start, end, finalized });
      setCandidates(names);
      setMerkleRoot(root);
      setIsPaused(paused);

      if (connectedAddress && typeof contract.hasUserVoted === "function") {
        try {
          const hv = await contract.hasUserVoted(Number(id), connectedAddress);
          setUserHasVoted(Boolean(hv));
        } catch {
          setUserHasVoted(false);
        }
      } else {
        setUserHasVoted(false);
      }
    } catch (err) {
      console.error("loadBallotById error", err);
      setStatus("Failed to load ballot: " + (err?.message || String(err)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (state?.ballotId != null) {
      setBallotIdInput(state.ballotId);
      loadBallotById(state.ballotId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ballotId]);

  useEffect(() => {
    if (!ballot) return;
    (async () => {
      try {
        const readFn = resolveReadOnlyInit();
        const ro = await readFn();
        const contract = ro?.contract || ro;
        if (contract && typeof contract.hasUserVoted === "function" && connectedAddress) {
          const hv = await contract.hasUserVoted(ballot.id, connectedAddress);
          setUserHasVoted(Boolean(hv));
        }
      } catch {
        // ignore
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress, ballot]);

  function tsToLocal(ts) {
    try {
      return new Date(Number(ts) * 1000).toLocaleString();
    } catch {
      return String(ts);
    }
  }

  function parseProof(text) {
    if (!text) return [];
    const parts = text.split(",").map(s => s.trim()).filter(Boolean);
    const ok = parts.every(p => /^0x[0-9a-fA-F]+$/.test(p));
    if (!ok) throw new Error("Merkle proof entries must be hex strings (0x...) separated by commas.");
    return parts;
  }

  async function submitVote(e) {
    e?.preventDefault?.();
    setStatus(null);

    if (!ballot) {
      setStatus("Load a ballot first.");
      return;
    }
    if (isPaused === true) {
      setStatus("Contract is paused — actions disabled.");
      return;
    }
    if (ballot.finalized) {
      setStatus("Ballot is finalized — cannot vote.");
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    if (now < ballot.start) {
      setStatus("Voting has not started yet.");
      return;
    }
    if (now > ballot.end) {
      setStatus("Voting window has ended.");
      return;
    }
    if (userHasVoted) {
      setStatus("You have already voted for this ballot.");
      return;
    }
    if (!selectedCandidate) {
      setStatus("Select a candidate first.");
      return;
    }

    try {
      if (!connectedAddress) {
        await connect();
        await new Promise(r => setTimeout(r, 300));
      }
    } catch (err) {
      setStatus("Wallet connect failed: " + (err?.message || String(err)));
      return;
    }

    setBusy(true);
    setStatus("Submitting transaction — confirm in MetaMask...");
    try {
      const signerInit = resolveSignerInit();
      const { contract } = await signerInit();
      if (!contract || typeof contract.vote !== "function") {
        throw new Error("Signer contract not available for voting.");
      }

      const proof = parseProof(merkleProofText);

      const tx = await contract.vote(ballot.id, selectedCandidate, proof);
      setStatus("Transaction submitted: " + tx.hash + " — waiting for confirmation...");
      await tx.wait();
      setStatus("Vote recorded ✅");
      setUserHasVoted(true);
      await loadBallotById(ballot.id);
    } catch (err) {
      console.error("submitVote failed", err);
      if (err?.code === 4001 || err?.code === "ACTION_REJECTED" || (err?.data && err.data?.code === 4001)) {
        setStatus("Transaction cancelled by user.");
      } else {
        const msg = err?.reason || err?.message || String(err);
        setStatus("Vote failed: " + msg);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Vote</h1>
        <p className="page-subtitle">Cast your vote on a ballot</p>
      </div>

      <div className="card mb-6">
        <div className="form-group mb-0">
          <div className="flex flex-wrap items-center gap-3">
            <label className="form-label mb-0">
              Ballot ID&nbsp;
              <input
                className="form-input"
                value={ballotIdInput}
                onChange={(e) => setBallotIdInput(e.target.value)}
                style={{ width: 120 }}
              />
            </label>
            <button className="btn btn-primary btn-sm" onClick={() => loadBallotById(ballotIdInput)}>
              Load Ballot
            </button>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => { setBallot(null); setCandidates([]); setSelectedCandidate(""); setStatus(null); setBallotIdInput(""); }}
            >
              Clear
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/")}>
              Home
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="card">
          <div className="flex items-center justify-center gap-3">
            <span className="spinner"></span>
            <span>Loading ballot...</span>
          </div>
        </div>
      )}

      {status && (
        <div className={`status-message ${status.includes("✅") ? "status-message-success" : "status-message-error"} mb-4`}>
          {status}
        </div>
      )}

      {!ballot ? (
        <div className="card">
          <p className="text-center">Load a ballot by id (from Home → Vote button or enter an ID) to see candidate list.</p>
        </div>
      ) : (
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">{ballot.title}</h2>
            <div className="text-sm mb-2">
              {tsToLocal(ballot.start)} → {tsToLocal(ballot.end)} {ballot.finalized && <span className="badge badge-success">Finalized</span>}
              {isPaused === true && <span className="badge badge-warning" style={{ marginLeft: 8 }}>Contract paused</span>}
            </div>
            <div className="text-sm">
              {userHasVoted ? (
                <span className="badge badge-primary">You already voted in this ballot</span>
              ) : (
                <span className="badge">You have not voted yet</span>
              )}
            </div>
          </div>

          <form onSubmit={submitVote}>
            <div className="form-group">
              <label className="form-label">Candidates</label>
              <div className="candidate-list">
                {candidates.length === 0 ? (
                  <div className="text-center">No candidates found.</div>
                ) : (
                  candidates.map((c, idx) => (
                    <div key={idx} className="candidate-item">
                      <input
                        type="radio"
                        name="candidate"
                        value={c}
                        checked={selectedCandidate === c}
                        onChange={() => setSelectedCandidate(c)}
                        disabled={userHasVoted || busy}
                        className="form-radio"
                      />
                      <label style={{ cursor: "pointer", flex: 1 }} onClick={() => !userHasVoted && !busy && setSelectedCandidate(c)}>
                        {c}
                      </label>
                    </div>
                  ))
                )}
              </div>
            </div>

            {merkleRoot && merkleRoot !== "0x" + "0".repeat(64) && (
              <div className="form-group">
                <label className="form-label">Merkle proof (comma-separated leaves, if required)</label>
                <input
                  className="form-input text-mono"
                  placeholder="0xab...,0xcd...,..."
                  value={merkleProofText}
                  onChange={(e) => setMerkleProofText(e.target.value)}
                  disabled={busy}
                />
                <div className="form-help">If this ballot is whitelisted, paste a comma-separated Merkle proof (hex bytes32 entries).</div>
              </div>
            )}

            <div className="mt-6">
              <button 
                type="submit" 
                className="btn btn-primary btn-lg btn-full"
                disabled={busy || userHasVoted || ballot.finalized || isPaused === true}
              >
                {busy ? "Submitting..." : "Vote"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
