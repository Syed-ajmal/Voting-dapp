// src/pages/Vote.jsx
import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import * as contractApi from "../api/contract";

/**
 * Vote page
 * - If location.state.ballotId provided, auto-load that ballot
 * - Otherwise user may enter ballot id manually
 * - Read-only calls use getReadOnlyContract() or default export
 * - Sending uses getSignerContract()
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
  const [merkleProofText, setMerkleProofText] = useState(""); // comma separated proof elements
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [userHasVoted, setUserHasVoted] = useState(false);
  const [isPaused, setIsPaused] = useState(null);

  // resolve read-only initializer (support getReadOnlyContract or default)
  function resolveReadOnlyInit() {
    if (typeof contractApi.getReadOnlyContract === "function") return contractApi.getReadOnlyContract;
    if (typeof contractApi.default === "function") return contractApi.default;
    throw new Error("No read-only contract initializer found in src/api/contract.");
  }

  // load ballot by id
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
      // tuple: title, startTimestamp, endTimestamp, merkleRoot, candidateCount, finalized
      const title = res[0];
      const start = Number(res[1] || 0);
      const end = Number(res[2] || 0);
      const root = res[3];
      const candidateCount = Number(res[4] || 0);
      const finalized = Boolean(res[5]);

      const names = [];
      for (let i = 0; i < candidateCount; i++) {
        try {
          const nm = await contract.getCandidateName(Number(id), i);
          names.push(nm);
        } catch (e) {
          names.push("");
        }
      }

      // paused state (if contract exposes paused())
      let paused = null;
      try {
        const p = await contract.paused();
        paused = Boolean(p);
      } catch {
        paused = null; // not available
      }

      setBallot({ id: Number(id), title, start, end, finalized });
      setCandidates(names);
      setMerkleRoot(root || "0x" + "0".repeat(64));
      setIsPaused(paused);

      // if connected, check if user already voted
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

  // whenever page state has ballotId, try loading
  useEffect(() => {
    if (state?.ballotId != null) {
      setBallotIdInput(state.ballotId);
      loadBallotById(state.ballotId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.ballotId]);

  // whenever connected address changes, re-check hasUserVoted for current ballot
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
      } catch (e) {
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

  // helper to parse merkle proof input (comma separated 0x... pieces)
  function parseProof(text) {
    if (!text) return [];
    return text.split(",").map(s => s.trim()).filter(Boolean);
  }

  // main vote action
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

    // ensure wallet connected
    try {
      if (!connectedAddress) {
        await connect();
        // short delay for wallet context update
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (err) {
      setStatus("Wallet connect failed: " + (err?.message || String(err)));
      return;
    }

    // send transaction via signer contract
    setBusy(true);
    setStatus("Submitting transaction — confirm in MetaMask...");
    try {
      if (typeof contractApi.getSignerContract !== "function") {
        throw new Error("getSignerContract not exported from src/api/contract");
      }
      const { contract } = await contractApi.getSignerContract();
      // merkle proof as array of bytes32 (strings)
      const proof = parseProof(merkleProofText);
      // call vote(ballotId, candidateName, proof)
      const tx = await contract.vote(ballot.id, selectedCandidate, proof);
      setStatus("Transaction submitted: " + tx.hash + " — waiting for confirmation...");
      await tx.wait();
      setStatus("Vote recorded ✅");
      // update hasVoted and candidate votes read-only refresh
      setUserHasVoted(true);
      // refresh ballot to update votes
      await loadBallotById(ballot.id);
    } catch (err) {
      console.error("submitVote failed", err);
      if (err?.code === 4001) {
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
    <div style={{ padding: 12 }}>
      <h2>Vote</h2>

      <div style={{ marginBottom: 12 }}>
        <label>Ballot ID&nbsp;
          <input
            value={ballotIdInput}
            onChange={(e) => setBallotIdInput(e.target.value)}
            style={{ width: 120 }}
          />
        </label>
        <button onClick={() => loadBallotById(ballotIdInput)} style={{ marginLeft: 8 }}>Load Ballot</button>
        <button onClick={() => { setBallot(null); setCandidates([]); setSelectedCandidate(""); setStatus(null); setBallotIdInput(""); }} style={{ marginLeft: 8 }}>Clear</button>
        <button onClick={() => navigate("/")} style={{ marginLeft: 8 }}>Home</button>
      </div>

      {loading && <div>Loading ballot...</div>}

      {status && <div style={{ marginBottom: 8, color: "darkred" }}>{status}</div>}

      {!ballot ? (
        <div>Load a ballot by id (from Home → Vote button or enter an ID) to see candidate list.</div>
      ) : (
        <div>
          <div style={{ marginBottom: 8 }}>
            <strong>{ballot.title}</strong>
            <div style={{ fontSize: 13, color: "#555" }}>
              {tsToLocal(ballot.start)} → {tsToLocal(ballot.end)} {ballot.finalized ? "(finalized)" : ""}
              {isPaused === true && <span style={{ color: "orange", marginLeft: 12 }}>Contract paused</span>}
            </div>
            <div style={{ marginTop: 6, fontSize: 13 }}>
              {userHasVoted ? <em>You already voted in this ballot.</em> : <em>You have not voted yet.</em>}
            </div>
          </div>

          <form onSubmit={submitVote}>
            <div style={{ marginBottom: 8 }}>
              <label>Candidates</label>
              <div>
                {candidates.length === 0 ? <div>No candidates found.</div> :
                  candidates.map((c, idx) => (
                    <div key={idx}>
                      <label>
                        <input
                          type="radio"
                          name="candidate"
                          value={c}
                          checked={selectedCandidate === c}
                          onChange={() => setSelectedCandidate(c)}
                          disabled={userHasVoted || busy}
                        />
                        {" "}{c}
                      </label>
                    </div>
                  ))
                }
              </div>
            </div>

            {merkleRoot && merkleRoot !== "0x" + "0".repeat(64) && (
              <div style={{ marginBottom: 8 }}>
                <label>Merkle proof (comma-separated leaves, if required)<br />
                  <input
                    placeholder="0xab...,0xcd...,..."
                    value={merkleProofText}
                    onChange={(e) => setMerkleProofText(e.target.value)}
                    style={{ width: "100%" }}
                    disabled={busy}
                  />
                </label>
                <div style={{ fontSize: 12, color: "#666" }}>If this ballot is whitelisted, paste a comma-separated Merkle proof (hex bytes32 entries).</div>
              </div>
            )}

            <div style={{ marginTop: 10 }}>
              <button type="submit" disabled={busy || userHasVoted || ballot.finalized || isPaused === true}>
                {busy ? "Submitting..." : "Vote"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
