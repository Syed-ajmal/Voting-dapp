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
 * Minimal, unstyled UI. This version uses `await getReadOnlyContract()` everywhere
 * to ensure the initializer is an async call that returns { contract, provider, url }.
 */

export default function AdminControl() {
  const { address: connectedAddress, connect } = useWallet();

  const [ownerAddress, setOwnerAddress] = useState(null);
  const [loading, setLoading] = useState(true);
  const [ballots, setBallots] = useState([]);
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [contractPaused, setContractPaused] = useState(null);

  // inputs per ballot: merkleRoot and newEndIso mapping
  const [merkleInputs, setMerkleInputs] = useState({}); // ballotId -> string
  const [endInputs, setEndInputs] = useState({}); // ballotId -> datetime-local string

  // load owner, pause state, ballots
  useEffect(() => {
    let mounted = true;

    async function loadAll() {
      setLoading(true);
      setStatus(null);
      try {
        // await the read-only initializer (may throw helpful errors)
        const res = await getReadOnlyContract();
        const { contract, provider, url } = res;
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

        // ballots
        const nextIdRaw = await contract.nextBallotId();
        const nextId = Number(nextIdRaw || 0);
        const list = [];

        for (let i = 0; i < nextId; i++) {
          try {
            const [title, startTsRaw, endTsRaw, merkleRoot, candidateCount_, finalized] = await contract.getBallot(i);
            const candidateCount = Number(candidateCount_);
            const candidateNames = [];
            const votes = [];
            for (let j = 0; j < candidateCount; j++) {
              try {
                const name = await contract.getCandidateName(i, j);
                candidateNames.push(name);
              } catch {
                candidateNames.push("");
              }
              try {
                const v = await contract.getVotes(i, j);
                votes.push(Number(v));
              } catch {
                votes.push(0);
              }
            }
            list.push({
              id: i,
              title,
              startTs: Number(startTsRaw),
              endTs: Number(endTsRaw),
              merkleRoot,
              candidateCount,
              finalized,
              candidateNames,
              votes,
            });
          } catch (err) {
            console.warn("Skipping ballot read", i, err);
          }
        }

        if (mounted) {
          setBallots(list);
          // seed input maps
          const m = {};
          const e = {};
          list.forEach(b => {
            m[b.id] = b.merkleRoot || "";
            try {
              const d = new Date(Number(b.endTs) * 1000);
              const iso = d.toISOString();
              e[b.id] = iso.slice(0, 16); // "YYYY-MM-DDTHH:mm"
            } catch {
              e[b.id] = "";
            }
          });
          setMerkleInputs(m);
          setEndInputs(e);
        }
      } catch (err) {
        console.error("loadAll admin failed", err);
        if (mounted) setStatus("Failed to load contract/ballots (check RPC). See console.");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadAll();
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
      setBallots(prev => prev.map(b => b.id === ballotId ? ({
        id: ballotId,
        title,
        startTs: Number(startTsRaw),
        endTs: Number(endTsRaw),
        merkleRoot,
        candidateCount,
        finalized,
        candidateNames,
        votes,
      }) : b));
      // update merkle inputs and endInputs if present
      setMerkleInputs(prev => ({ ...prev, [ballotId]: merkleRoot || "" }));
      try {
        const dIso = new Date(Number(endTsRaw) * 1000).toISOString().slice(0,16);
        setEndInputs(prev => ({ ...prev, [ballotId]: dIso }));
      } catch {}
    } catch (err) {
      console.error("refreshBallot failed", err);
      setStatus("Failed to refresh ballot; see console.");
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <h2>Admin Control</h2>

      <div style={{ marginBottom: 10 }}>
        <div>Contract owner (RPC): {ownerAddress || "loading..."}</div>
        <div>Connected wallet: {connectedAddress || "not connected"}</div>
        <div>Contract paused: {contractPaused === null ? "unknown" : contractPaused ? "yes" : "no"}</div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <button onClick={togglePause} disabled={busy || !isOwnerConnected()}>
          {busy ? "Working..." : (contractPaused ? "Unpause Contract" : "Pause Contract")}
        </button>
        {!isOwnerConnected() && <span style={{ marginLeft: 8, color: "red" }}>Owner only</span>}
      </div>

      {status && <div style={{ marginBottom: 12, color: "darkred" }}>{status}</div>}

      {loading ? (
        <div>Loading ballots...</div>
      ) : ballots.length === 0 ? (
        <div>No ballots found.</div>
      ) : (
        <div>
          {ballots.map(b => (
            <div key={b.id} style={{ border: "1px solid #eee", padding: 10, marginBottom: 10 }}>
              <div style={{ fontWeight: "600" }}>[{b.id}] {b.title}</div>
              <div style={{ fontSize: 13, color: "#555" }}>
                {tsToLocal(b.startTs)} → {tsToLocal(b.endTs)} {b.finalized ? "(finalized)" : ""}
              </div>

              <div style={{ marginTop: 8 }}>
                <div>
                  <strong>Merkle root:</strong><br />
                  <input
                    value={merkleInputs[b.id] ?? ""}
                    onChange={e => setMerkleInput(b.id, e.target.value)}
                    placeholder="0x... or leave blank to clear"
                    style={{ width: "70%" }}
                    disabled={!isOwnerConnected() || busy}
                  />
                  <button onClick={() => doUpdateMerkle(b.id)} disabled={!isOwnerConnected() || busy} style={{ marginLeft: 8 }}>
                    Update Merkle Root
                  </button>
                </div>

                <div style={{ marginTop: 8 }}>
                  <strong>Extend end time:</strong><br />
                  <input
                    type="datetime-local"
                    value={endInputs[b.id] ?? ""}
                    onChange={e => setEndInput(b.id, e.target.value)}
                    disabled={!isOwnerConnected() || busy}
                  />
                  <button onClick={() => doExtendEnd(b.id)} disabled={!isOwnerConnected() || busy} style={{ marginLeft: 8 }}>
                    Extend End
                  </button>
                </div>

                <div style={{ marginTop: 8 }}>
                  <button onClick={() => doFinalize(b.id)} disabled={!isOwnerConnected() || busy || b.finalized}>
                    Finalize Ballot
                  </button>
                  <button onClick={() => refreshBallot(b.id)} style={{ marginLeft: 8 }} disabled={busy}>
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
