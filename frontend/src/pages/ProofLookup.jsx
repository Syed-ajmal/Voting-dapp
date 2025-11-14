// src/pages/ProofLookup.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import { useWallet } from "../context/WalletContext";

/**
 * ProofLookup
 * - Enter CID or gateway URL (e.g. CID or https://gateway.pinata.cloud/ipfs/<CID>)
 * - Fetch proofs.json from gateway
 * - Automatically lookup proof for connected wallet if available
 * - Manual address lookup still supported
 * - "Use in Vote" navigates to Vote page with proof in location.state
 */

export default function ProofLookup() {
  const navigate = useNavigate();
  const { address: connectedAddress, connect } = useWallet();

  const [cidOrUrl, setCidOrUrl] = useState("");
  const [gatewayUrl, setGatewayUrl] = useState("https://gateway.pinata.cloud/ipfs/"); // default gateway
  const [loading, setLoading] = useState(false);
  const [proofsObj, setProofsObj] = useState(null);
  const [error, setError] = useState(null);
  const [manualAddr, setManualAddr] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(null);

  // Build URL to fetch from user input (CID or full URL)
  function toFetchUrl(input) {
    if (!input) return null;
    const trimmed = input.trim();
    // if input looks like a full URL, return it
    try {
      const u = new URL(trimmed);
      return trimmed;
    } catch {
      // treat input as CID and build URL using gateway
      const cid = trimmed;
      if (!cid) return null;
      return gatewayUrl.replace(/\/+$/, "") + "/" + cid;
    }
  }

  // Fetch proofs.json from a URL (or try url and url/proofs.json)
  async function fetchProofs() {
    setError(null);
    setResult(null);
    setProofsObj(null);
    setStatus(null);

    const url = toFetchUrl(cidOrUrl);
    if (!url) {
      setError("Enter a CID or a full IPFS URL.");
      return;
    }

    // candidates: the raw url and url/proofs.json (helpful if the CID points to a folder)
    const candidates = [url, url.replace(/\/$/, "") + "/proofs.json"];
    setLoading(true);

    for (const u of candidates) {
      try {
        const res = await fetch(u, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${u}`);
        const json = await res.json();
        setProofsObj(json);
        setStatus(`Loaded proofs from ${u}`);
        setLoading(false);
        return;
      } catch (err) {
        console.warn("fetch attempt failed for", u, err);
      }
    }

    setLoading(false);
    setError("Failed to fetch proofs.json. Try a different gateway or verify the CID/path. See console for details.");
    console.error("Proof fetch attempts failed; tried:", candidates);
  }

  // Find proof by normalized address in proofsObj
  function findProofForAddress(addr) {
    if (!proofsObj) return null;
    try {
      const norm = ethers.getAddress(addr);
      // direct match
      if (proofsObj[norm]) return { address: norm, info: proofsObj[norm] };
      // case-insensitive fallback
      const foundKey = Object.keys(proofsObj).find(k => k.toLowerCase() === norm.toLowerCase());
      if (foundKey) return { address: foundKey, info: proofsObj[foundKey] };
      return null;
    } catch (err) {
      return null;
    }
  }

  // Lookup (uses manualAddr if provided, otherwise connectedAddress)
  async function lookup() {
    setError(null);
    setResult(null);
    setStatus(null);

    if (!proofsObj) {
      setError("No proofs loaded. Fetch first.");
      return;
    }

    const target = (manualAddr && manualAddr.trim()) || connectedAddress;
    if (!target) {
      setError("No address provided and wallet not connected. Connect or enter an address.");
      return;
    }

    try {
      const norm = ethers.getAddress(target.trim());
      const found = findProofForAddress(norm);
      if (!found) {
        setError(`No proof found for address ${norm}`);
        return;
      }
      setResult({ address: found.address, leaf: found.info.leaf, proof: found.info.proof });
      setStatus(`Proof found for ${norm}`);
    } catch (err) {
      setError("Invalid address. Please enter a valid Ethereum address.");
    }
  }

  // Auto-lookup when proofsObj is loaded and a wallet is connected (and no manual lookup done)
  useEffect(() => {
    if (!proofsObj) return;
    // prefer connected address; if available, auto-lookup it
    if (connectedAddress) {
      // slight delay to keep UI responsive
      (async () => {
        setStatus("Auto-looking up proof for connected wallet...");
        try {
          await lookup();
        } catch (e) {
          // lookup handles errors internally
        } finally {
          // keep status or error as set by lookup()
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proofsObj, connectedAddress]);

  // Copy proof (comma-separated) to clipboard
  function handleCopyProof() {
    if (!result) return;
    const txt = (result.proof || []).join(",");
    navigator.clipboard?.writeText(txt).then(() => {
      setStatus("Proof copied to clipboard.");
      setTimeout(() => setStatus(null), 1200);
    }).catch(() => setError("Copy failed"));
  }

  // Download single proof JSON for a found address
  function handleDownloadProofJson() {
    if (!result) return;
    const obj = { [result.address]: { leaf: result.leaf, proof: result.proof } };
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.address}_proof.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Use in Vote: navigate to vote page and pass the comma-separated proof via state
  function handleUseInVote(ballotId = null) {
    if (!result) return;
    const proofText = (result.proof || []).join(",");
    navigate("/vote", { state: { ballotId, merkleProofText: proofText } });
  }

  // Download full proofs.json (convenience)
  function handleDownloadAllProofs() {
    if (!proofsObj) return;
    const blob = new Blob([JSON.stringify(proofsObj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proofs.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Proof Lookup</h1>
        <p className="page-subtitle">Lookup Merkle proofs from IPFS / Pinata</p>
      </div>

      <div className="card mb-6">
        <div className="form-group">
          <label className="form-label">Gateway base URL (optional)</label>
          <input 
            className="form-input" 
            value={gatewayUrl} 
            onChange={(e) => setGatewayUrl(e.target.value)} 
            placeholder="https://gateway.pinata.cloud/ipfs/"
          />
        </div>

        <div className="form-group">
          <label className="form-label">CID or IPFS URL</label>
          <div className="flex gap-3 flex-wrap items-end">
            <input 
              className="form-input" 
              value={cidOrUrl} 
              onChange={(e) => setCidOrUrl(e.target.value)} 
              placeholder="Qm... or /ipfs/<CID> or https://gateway.pinata.cloud/ipfs/<CID>"
              style={{ flex: 1, minWidth: 300 }}
            />
            <button 
              className="btn btn-primary btn-sm" 
              onClick={fetchProofs} 
              disabled={loading}
            >
              {loading ? <><span className="spinner" style={{ marginRight: 8 }}></span>Fetching...</> : "Fetch proofs.json"}
            </button>
          </div>
          <div className="form-help">
            Note: gateways may enforce CORS. If fetch fails, try a different gateway (https://ipfs.io/ipfs/..., https://cloudflare-ipfs.com/ipfs/..., https://gateway.pinata.cloud/ipfs/...).
          </div>
        </div>
      </div>

      {proofsObj && (
        <div className="card mb-6">
          <div className="mb-3">
            <strong>Proofs loaded — {Object.keys(proofsObj).length} addresses</strong>
          </div>
          <div className="flex gap-3 flex-wrap">
            <button 
              className="btn btn-secondary btn-sm"
              onClick={() => navigator.clipboard?.writeText(JSON.stringify(proofsObj)).then(() => setStatus("Full proofs copied."))}
            >
              Copy whole JSON
            </button>
            <button 
              className="btn btn-secondary btn-sm"
              onClick={handleDownloadAllProofs}
            >
              Download proofs.json
            </button>
          </div>
        </div>
      )}

      <div className="card mb-6">
        <div className="mb-4">
          <strong>Lookup address</strong> — wallet connected: {connectedAddress ? <span className="address">{connectedAddress}</span> : "no"}
        </div>
        <div className="form-group mb-0">
          <div className="flex gap-3 flex-wrap items-end">
            <label className="form-label mb-0" style={{ flex: 1, minWidth: 200 }}>
              Manual address (optional)
              <input 
                className="form-input text-mono" 
                value={manualAddr} 
                onChange={(e) => setManualAddr(e.target.value)} 
                placeholder="0x..."
              />
            </label>
            <button 
              className="btn btn-primary btn-sm"
              onClick={async () => {
                setError(null);
                // if not connected and no manual address entered, try to connect
                if (!manualAddr && !connectedAddress) {
                  try {
                    await connect();
                    await new Promise(r => setTimeout(r, 200));
                  } catch (err) {
                    setError("Connect failed: " + (err?.message || err));
                    return;
                  }
                }
                await lookup();
              }}
            >
              Lookup (use wallet if manual empty)
            </button>
          </div>
        </div>
      </div>

      {error && <div className="status-message status-message-error mb-4">{error}</div>}
      {status && <div className="status-message status-message-info mb-4">{status}</div>}

      {result && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Proof Found</h3>
          </div>
          <div className="card-body">
            <div className="mb-4">
              <strong>Address:</strong> <code className="address">{result.address}</code>
            </div>
            <div className="mb-4">
              <strong>Leaf:</strong> <code className="text-mono" style={{ wordBreak: "break-all", display: "block", marginTop: 4 }}>{result.leaf}</code>
            </div>
            <div className="mb-4">
              <strong>Proof ({result.proof.length}):</strong>
              <ol style={{ marginTop: 8, paddingLeft: 20 }}>
                {result.proof.map((p, i) => (
                  <li key={i} style={{ marginBottom: 4 }}>
                    <code className="text-mono" style={{ wordBreak: "break-all" }}>{p}</code>
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <div className="card-footer">
            <div className="flex gap-3 flex-wrap">
              <button className="btn btn-primary btn-sm" onClick={handleCopyProof}>Copy proof (comma)</button>
              <button className="btn btn-secondary btn-sm" onClick={handleDownloadProofJson}>Download this proof as JSON</button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleUseInVote()}>Use in Vote</button>
            </div>
            <div className="form-help mt-3">
              Tip: you can paste the comma-separated proof into the Vote page merkle input. Or click <em>Use in Vote</em> to open the Vote page with the proof prefilled.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
