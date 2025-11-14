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
    <div style={{ padding: 12 }}>
      <h2>Proof Lookup (from IPFS / Pinata)</h2>

      <div style={{ marginBottom: 8 }}>
        <div>
          <label>Gateway base URL (optional):&nbsp;
            <input value={gatewayUrl} onChange={(e) => setGatewayUrl(e.target.value)} style={{ width: 380 }} />
          </label>
        </div>

        <div style={{ marginTop: 8 }}>
          <label>CID or IPFS URL:&nbsp;
            <input value={cidOrUrl} onChange={(e) => setCidOrUrl(e.target.value)} style={{ width: 400 }} placeholder="Qm... or /ipfs/<CID> or https://gateway.pinata.cloud/ipfs/<CID>" />
          </label>
          <button onClick={fetchProofs} style={{ marginLeft: 8 }} disabled={loading}>{loading ? "Fetching..." : "Fetch proofs.json"}</button>
        </div>

        <div style={{ marginTop: 8 }}>
          <small>Note: gateways may enforce CORS. If fetch fails, try a different gateway (https://ipfs.io/ipfs/..., https://cloudflare-ipfs.com/ipfs/..., https://gateway.pinata.cloud/ipfs/...).</small>
        </div>
      </div>

      {proofsObj && (
        <div style={{ marginBottom: 12 }}>
          <div>Proofs loaded — {Object.keys(proofsObj).length} addresses</div>
          <div style={{ marginTop: 8 }}>
            <button onClick={() => navigator.clipboard?.writeText(JSON.stringify(proofsObj)).then(() => setStatus("Full proofs copied."))}>Copy whole JSON</button>
            <button onClick={handleDownloadAllProofs} style={{ marginLeft: 8 }}>Download proofs.json</button>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 12 }}>
        <div>
          <strong>Lookup address</strong> — wallet connected: {connectedAddress || "no"}
        </div>
        <div style={{ marginTop: 6 }}>
          <label>Manual address (optional):&nbsp;
            <input value={manualAddr} onChange={(e) => setManualAddr(e.target.value)} style={{ width: 360 }} placeholder="0x..." />
          </label>

          <button onClick={async () => {
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
          }} style={{ marginLeft: 8 }}>
            Lookup (use wallet if manual empty)
          </button>
        </div>
      </div>

      {error && <div style={{ color: "darkred", marginBottom: 10 }}>{error}</div>}
      {status && <div style={{ color: "#333", marginBottom: 10 }}>{status}</div>}

      {result ? (
        <div style={{ border: "1px solid #eee", padding: 10, maxWidth: 800 }}>
          <div><strong>Address:</strong> <code>{result.address}</code></div>
          <div style={{ marginTop: 6 }}><strong>Leaf:</strong> <code style={{ wordBreak: "break-all" }}>{result.leaf}</code></div>
          <div style={{ marginTop: 6 }}><strong>Proof ({result.proof.length}):</strong>
            <ol>
              {result.proof.map((p, i) => <li key={i}><code style={{ wordBreak: "break-all" }}>{p}</code></li>)}
            </ol>
          </div>

          <div style={{ marginTop: 8 }}>
            <button onClick={handleCopyProof}>Copy proof (comma)</button>
            <button onClick={handleDownloadProofJson} style={{ marginLeft: 8 }}>Download this proof as JSON</button>
            <button onClick={() => handleUseInVote()} style={{ marginLeft: 8 }}>Use in Vote (open Vote page)</button>
          </div>

          <div style={{ marginTop: 8, fontSize: 13, color: "#666" }}>
            Tip: you can paste the comma-separated proof into the Vote page merkle input. Or click <em>Use in Vote</em> to open the Vote page with the proof prefilled (Vote must accept route state).
          </div>
        </div>
      ) : null}
    </div>
  );
}
