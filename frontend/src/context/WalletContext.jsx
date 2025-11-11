// src/context/WalletContext.jsx
import React, { createContext, useContext, useEffect, useState } from "react";
import { ethers } from "ethers";

const WalletContext = createContext(null);
const MARKER_KEY = "simple_voting_wallet_connected";

/**
 * WalletProvider - central wallet context for the app.
 * - requiredChainId (optional): hex chain id string (e.g. "0xaa36a7" for Sepolia)
 */
export function WalletProvider({ children, requiredChainId = null }) {
  const [address, setAddress] = useState(null);
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);
  const [connected, setConnected] = useState(false);
  const [chainId, setChainId] = useState(null);

  // Init: read accounts and chain, and subscribe to changes.
  useEffect(() => {
    if (!window.ethereum) return;

    const eth = window.ethereum;

    const handleAccounts = (accounts) => {
      if (accounts && accounts[0]) {
        setAddress(accounts[0]);
        setConnected(true);
      } else {
        setAddress(null);
        setConnected(false);
        setSigner(null);
        setProvider(null);
      }
    };

    const handleChain = (c) => {
      setChainId(c);
      // optional: you can auto-switch or notify the UI if requiredChainId is set
    };

    // Try restore silently if user previously connected
    const tryRestore = async () => {
      try {
        const flag = window.localStorage.getItem(MARKER_KEY);
        if (flag) {
          const accounts = await eth.request({ method: "eth_accounts" });
          handleAccounts(accounts || []);
        } else {
          // still read eth_accounts once for initial UI correctness (silent)
          const accounts = await eth.request({ method: "eth_accounts" }).catch(() => []);
          handleAccounts(accounts || []);
        }
      } catch (e) {
        console.warn("restore accounts failed", e);
      }
    };

    tryRestore();
    eth.request({ method: "eth_chainId" }).then(handleChain).catch(() => {});

    // subscribe
    if (eth.on) {
      eth.on("accountsChanged", handleAccounts);
      eth.on("chainChanged", handleChain);
    }

    return () => {
      if (eth.removeListener) {
        eth.removeListener("accountsChanged", handleAccounts);
        eth.removeListener("chainChanged", handleChain);
      }
    };
  }, []);

  // When address changes, set up provider and signer if not already set
  useEffect(() => {
    async function setupFromAddress() {
      if (!address) return;
      try {
        // If provider/signer already set by connect(), keep them; otherwise create.
        if (!provider || !signer) {
          const bp = new ethers.BrowserProvider(window.ethereum);
          const s = await bp.getSigner();
          setProvider(bp);
          setSigner(s);
          setConnected(true);
        }
      } catch (err) {
        console.error("wallet setup failed", err);
      }
    }
    setupFromAddress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  // Improved connect: returns signer+provider and persists intent
  const connect = async () => {
    if (!window.ethereum) throw new Error("No injected wallet found");
    const eth = window.ethereum;
    const accounts = await eth.request({ method: "eth_requestAccounts" });
    if (!accounts || !accounts[0]) throw new Error("No account returned");
    // set address immediately
    setAddress(accounts[0]);
    // persist intent for silent restore
    window.localStorage.setItem(MARKER_KEY, "1");

    // build provider+signer before resolving so callers can immediately use them
    try {
      const bp = new ethers.BrowserProvider(window.ethereum);
      const s = await bp.getSigner();
      setProvider(bp);
      setSigner(s);
      setConnected(true);
      // set chainId if available
      try {
        const net = await bp.getNetwork();
        setChainId(net.chainId);
      } catch {}
      return { address: accounts[0], provider: bp, signer: s };
    } catch (err) {
      console.error("connect: failed to create signer/provider", err);
      // still resolve with address
      return { address: accounts[0] };
    }
  };

  // Local disconnect only
  const disconnect = () => {
    setAddress(null);
    setSigner(null);
    setProvider(null);
    setConnected(false);
    window.localStorage.removeItem(MARKER_KEY);
  };

  return (
    <WalletContext.Provider
      value={{
        address,
        signer,
        provider,
        connected,
        chainId,
        connect,
        disconnect,
        requiredChainId,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

// Hook to consume wallet context
export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
