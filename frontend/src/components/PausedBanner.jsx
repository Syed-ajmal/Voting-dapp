// src/components/PausedBanner.jsx
import React, { useEffect, useState } from "react";
import * as contractApi from "../api/contract";

/**
 * PausedBanner
 * - Reads contract.paused() using read-only contract helper.
 * - Shows a top banner when contract is paused.
 * - Polls every 10s and re-checks on window focus to stay up-to-date.
 *
 * Place this near the top of the app (App.jsx) so it appears on all pages.
 */

export default function PausedBanner() {
  const [paused, setPaused] = useState(null); // null = unknown, true/false = known
  const [error, setError] = useState(null);

  // get read-only initializer (supports getReadOnlyContract or default export)
  function resolveReadOnlyInit() {
    if (typeof contractApi.getReadOnlyContract === "function") return contractApi.getReadOnlyContract;
    if (typeof contractApi.default === "function") return contractApi.default;
    throw new Error("No read-only contract initializer found in src/api/contract.");
  }

  async function checkPaused() {
    try {
      const readFn = resolveReadOnlyInit();
      const ro = await readFn();
      const contract = ro?.contract || ro;
      if (!contract || typeof contract.paused !== "function") {
        // contract doesn't expose paused(): set unknown
        setPaused(null);
        return;
      }
      const p = await contract.paused();
      setPaused(Boolean(p));
      setError(null);
    } catch (err) {
      console.warn("PausedBanner: failed to read paused()", err);
      setError("Could not read contract paused state (check RPC/config).");
      setPaused(null);
    }
  }

  useEffect(() => {
    let mounted = true;
    // initial check
    checkPaused();

    // poll every 10s
    const t = setInterval(() => {
      if (mounted) checkPaused();
    }, 10000);

    // re-check on window focus (fast feedback when user switches back)
    const onFocus = () => { if (mounted) checkPaused(); };
    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If paused === null (unknown) show nothing (avoid noise). Only show banner when sure paused === true.
  if (paused !== true) return null;

  return (
    <div style={{
      background: "#fff4e5",
      borderBottom: "1px solid #ffd89a",
      padding: "10px 14px",
      textAlign: "center",
      color: "#7a4a00",
      fontWeight: 600
    }}>
      ⚠️ Contract is currently <span style={{ textDecoration: "underline" }}>PAUSED</span>. All state-changing actions (create, vote, extend, update) are disabled until the owner unpauses the contract.
      {error ? <div style={{ fontWeight: 400, marginTop: 6, fontSize: 13, color: "#7a4a00" }}>{error}</div> : null}
    </div>
  );
}
