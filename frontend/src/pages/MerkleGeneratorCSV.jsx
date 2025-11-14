// src/pages/MerkleGeneratorCSV.jsx
import React, { useState, useMemo } from "react";
import { ethers } from "ethers";

/**
 * MerkleGeneratorCSV.jsx
 * - Parses CSV (simple parser)
 * - Lets you pick column with addresses
 * - Normalizes addresses using ethers.getAddress
 * - Builds deterministic Merkle tree (pair-wise sorted)
 * - Produces root and per-address proofs
 */

/* ---------- Merkle helpers (ethers v6 friendly) ---------- */

function hexToBytes(hex) {
  // expects 0x... hex string, returns Uint8Array
  return ethers.getBytes(hex);
}

function keccak(hexOrBytes) {
  return ethers.keccak256(hexOrBytes);
}

/**
 * Build leaves from addresses:
 * - normalize address to checksum (ethers.getAddress)
 * - hexlify checksum address (0x...) and hash that bytes
 * Each leaf is the keccak256 of the raw 20-byte address (as hex)
 */
function buildLeavesFromAddresses(addresses) {
  return addresses.map((addr) => {
    const a = ethers.getAddress(addr); // normalized checksum address
    const addrHex = ethers.hexlify(a); // "0x..." (hex of address)
    return keccak(hexToBytes(addrHex));
  });
}

/**
 * Deterministic sorted-pair Merkle tree builder.
 * leaves: array of hex strings ("0x...")
 * returns { levels } where levels[0] == leaves, top level last element contains root
 */
function buildMerkleTree(leaves) {
  let level = leaves.slice();
  const levels = [level];

  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : null;

      if (right === null) {
        // odd node -> pair with itself (deterministic)
        const a = left;
        const b = left;
        const [A, B] = a.toLowerCase() <= b.toLowerCase() ? [a, b] : [b, a];
        const combined = keccak(ethers.concat([hexToBytes(A), hexToBytes(B)]));
        next.push(combined);
      } else {
        const [A, B] = left.toLowerCase() <= right.toLowerCase() ? [left, right] : [right, left];
        const combined = keccak(ethers.concat([hexToBytes(A), hexToBytes(B)]));
        next.push(combined);
      }
    }
    level = next;
    levels.push(level);
  }

  return { levels };
}

/**
 * Build Merkle proof for leaf index from tree levels.
 * Returns array of hex strings (sibling nodes).
 */
function getProofForIndex(levels, index) {
  const proof = [];
  let idx = index;
  for (let l = 0; l < levels.length - 1; l++) {
    const level = levels[l];
    const siblingIndex = idx ^ 1; // sibling
    if (siblingIndex < level.length) {
      proof.push(level[siblingIndex]);
    } else {
      // sibling missing (odd) -> sibling equals itself
      proof.push(level[idx]);
    }
    idx = Math.floor(idx / 2);
  }
  return proof;
}

/* ---------- CSV parse helpers (simple) ---------- */

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  const rows = lines.map((line) =>
    line
      .split(",")
      .map((c) => c.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"))
  );

  const headers = rows.length > 0 ? rows[0] : [];
  const data = rows.length > 1 ? rows.slice(1) : [];
  return { headers, rows: data };
}

/* ---------- React component ---------- */

export default function MerkleGeneratorCSV() {
  const [csvText, setCsvText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [selectedCol, setSelectedCol] = useState(0);
  const [addresses, setAddresses] = useState([]);
  const [invalidRows, setInvalidRows] = useState([]);
  const [merkleRoot, setMerkleRoot] = useState(null);
  const [proofsMap, setProofsMap] = useState(null);
  const [status, setStatus] = useState(null);

  async function handleFileUpload(file) {
    setStatus(null);
    const text = await file.text();
    setCsvText(text);
    const p = parseCsv(text);
    setParsed(p);
    setSelectedCol(p.headers && p.headers.length > 0 ? 0 : 0);
    setAddresses([]);
    setInvalidRows([]);
    setMerkleRoot(null);
    setProofsMap(null);
  }

  function handleParseClick() {
    setStatus(null);
    if (!parsed) {
      setStatus("No CSV loaded.");
      return;
    }
    const col = Number(selectedCol);
    const extracted = parsed.rows.map((r) => r[col] ?? "");
    const good = [];
    const invalid = [];
    extracted.forEach((val, i) => {
      const v = (val || "").trim();
      try {
        if (!v) throw new Error("empty");
        const norm = ethers.getAddress(v);
        good.push(norm);
      } catch (err) {
        invalid.push({ row: i + 2, raw: val });
      }
    });
    setAddresses(good);
    setInvalidRows(invalid);
    setStatus(`${good.length} valid addresses, ${invalid.length} invalid`);
  }

  const leaves = useMemo(() => {
    if (!addresses || addresses.length === 0) return [];
    try {
      return buildLeavesFromAddresses(addresses);
    } catch {
      return [];
    }
  }, [addresses]);

  function handleCopy(text) {
    navigator.clipboard?.writeText(text).then(() => {
      setStatus("Copied to clipboard.");
      setTimeout(() => setStatus(null), 1200);
    }).catch(() => setStatus("Copy failed"));
  }

  function downloadJSON(obj, filename = "data.json") {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function handleGenerateRootAndProofs() {
    setStatus(null);
    setMerkleRoot(null);
    setProofsMap(null);

    if (!addresses || addresses.length === 0) {
      setStatus("No valid addresses to build tree.");
      return;
    }

    try {
      const tree = buildMerkleTree(leaves);
      const root = tree.levels.length ? tree.levels[tree.levels.length - 1][0] : null;
      if (!root) {
        setStatus("Failed to compute root.");
        return;
      }

      const proofs = {};
      for (let i = 0; i < leaves.length; i++) {
        const proof = getProofForIndex(tree.levels, i);
        proofs[addresses[i]] = {
          leaf: leaves[i],
          proof,
        };
      }

      setMerkleRoot(root);
      setProofsMap(proofs);
      setStatus("Merkle root & proofs generated.");
    } catch (err) {
      console.error("build error", err);
      setStatus("Error building Merkle tree: " + (err?.message || String(err)));
    }
  }

  function handleParseText() {
    const p = parseCsv(csvText);
    setParsed(p);
    setSelectedCol(p.headers && p.headers.length > 0 ? 0 : 0);
    setAddresses([]);
    setInvalidRows([]);
    setMerkleRoot(null);
    setProofsMap(null);
    setStatus("Parsed CSV text. Choose column and click 'Inspect / Validate'.");
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Merkle Generator</h1>
        <p className="page-subtitle">Generate Merkle trees from CSV address lists</p>
      </div>

      <div className="card mb-6">
        <div className="form-group">
          <label className="form-label"><strong>Upload CSV</strong></label>
          <input
            className="form-input"
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              if (f) handleFileUpload(f);
            }}
          />
        </div>

        <div className="form-group">
          <label className="form-label">Or paste CSV content</label>
          <textarea
            className="form-textarea"
            rows={6}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Paste CSV here (first row header optional), then click Parse CSV"
          />
          <div className="mt-3">
            <button className="btn btn-primary btn-sm" onClick={handleParseText}>Parse CSV</button>
          </div>
        </div>
      </div>

      {parsed && (
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="card-title">Parsed CSV</h3>
            <div className="text-sm">
              Columns detected: {parsed.headers.length || (parsed.rows[0] && parsed.rows[0].length) || 0}
            </div>
          </div>
          <div className="card-body">
            <div className="form-group">
              <div className="flex gap-3 flex-wrap items-end">
                <label className="form-label mb-0" style={{ flex: 1, minWidth: 200 }}>
                  Choose address column
                  <select
                    className="form-select"
                    value={selectedCol ?? 0}
                    onChange={(e) => setSelectedCol(Number(e.target.value))}
                  >
                    {((parsed.headers && parsed.headers.length > 0) ? parsed.headers : parsed.rows[0] || []).map((h, i) => (
                      <option key={i} value={i}>{h || `column ${i}`}</option>
                    ))}
                  </select>
                </label>
                <button className="btn btn-primary btn-sm" onClick={handleParseClick}>Inspect / Validate</button>
              </div>
            </div>

            <div className="text-sm mt-4">
              <strong>Sample rows (first 5)</strong>
              <ul style={{ marginTop: 8 }}>
                {parsed.rows.slice(0, 5).map((r, idx) => (
                  <li key={idx}>{r.map(c => c).join(" | ")}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {addresses.length > 0 && (
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="card-title">Normalized Addresses ({addresses.length})</h3>
          </div>
          <div className="card-body">
            {invalidRows.length > 0 && (
              <div className="status-message status-message-error mb-4">
                {invalidRows.length} invalid rows detected (row numbers shown).
                <ul style={{ marginTop: 8 }}>
                  {invalidRows.slice(0, 10).map((ir, i) => <li key={i}>Row {ir.row}: "{ir.raw}"</li>)}
                </ul>
              </div>
            )}

            <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid var(--color-border-primary)", padding: 12, borderRadius: 8, backgroundColor: "var(--color-bg-tertiary)" }}>
              <ol>
                {addresses.map((a, i) => <li key={i}><code className="address">{a}</code></li>)}
              </ol>
            </div>

            <div className="flex gap-3 flex-wrap mt-4">
              <button className="btn btn-secondary btn-sm" onClick={() => handleCopy(addresses.join("\n"))}>Copy (lines)</button>
              <button className="btn btn-secondary btn-sm" onClick={() => handleCopy(addresses.join(","))}>Copy (comma)</button>
              <button className="btn btn-secondary btn-sm" onClick={() => downloadJSON(addresses, "addresses.json")}>Download addresses.json</button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <button 
          className="btn btn-primary btn-lg" 
          onClick={handleGenerateRootAndProofs} 
          disabled={!addresses || addresses.length === 0}
        >
          Generate Merkle Root & Proofs
        </button>
      </div>

      {merkleRoot && (
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="card-title">Merkle Root</h3>
          </div>
          <div className="card-body">
            <div className="address" style={{ wordBreak: "break-all", padding: 12, borderRadius: 8 }}>
              {merkleRoot}
            </div>
            <div className="flex gap-3 flex-wrap mt-4">
              <button className="btn btn-secondary btn-sm" onClick={() => handleCopy(merkleRoot)}>Copy Root</button>
              <button className="btn btn-secondary btn-sm" onClick={() => downloadJSON({ root: merkleRoot }, "merkle_root.json")}>Download root</button>
            </div>
          </div>
        </div>
      )}

      {proofsMap && (
        <div className="card mb-6">
          <div className="card-header">
            <h3 className="card-title">Proofs</h3>
          </div>
          <div className="card-body">
            <div className="flex gap-3 flex-wrap mb-4">
              <button className="btn btn-secondary btn-sm" onClick={() => downloadJSON(proofsMap, "proofs.json")}>Download proofs.json</button>
              <button className="btn btn-secondary btn-sm" onClick={() => {
                const lines = Object.entries(proofsMap).map(([addr, info]) => `${addr} : [${(info.proof || []).join(",")}]`);
                handleCopy(lines.join("\n"));
              }}>Copy proofs (lines)</button>
            </div>

            <div style={{ maxHeight: 240, overflow: "auto", border: "1px solid var(--color-border-primary)", padding: 12, borderRadius: 8, backgroundColor: "var(--color-bg-tertiary)" }}>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0, fontSize: "0.875rem" }}>{JSON.stringify(proofsMap, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {status && <div className="status-message status-message-info mb-4">{status}</div>}
    </div>
  );
}
