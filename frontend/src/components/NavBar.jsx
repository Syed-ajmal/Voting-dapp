// src/components/NavBar.jsx
import React from "react";
import { Link } from "react-router-dom";
import { useWallet } from "../context/WalletContext";

export default function NavBar() {
  const { address, connected, connect, disconnect } = useWallet();

  const short = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");

  return (
    <div style={{ padding: 8, borderBottom: "1px solid #eee" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <strong>SimpleVoting</strong>
          <span style={{ marginLeft: 12 }}>
            <Link to="/">Home</Link>
          </span>
          <span style={{ marginLeft: 12 }}>
            <Link to="/create">Create</Link>
          </span>
          <span style={{ marginLeft: 12 }}>
            <Link to="/vote">Vote</Link>
          </span>
          <span style={{ marginLeft: 12 }}>
            <Link to="/results">Results</Link>
          </span>
          <span style={{ marginLeft: 12 }}>
            <Link to="/admin">Admin</Link>
          </span>
          <span style={{ marginLeft: 12 }}>
            <Link to="/merkle">Merkle</Link>
          </span>
          <span style={{ marginLeft: 12 }}>
            <Link to="/proof-lookup">Proof-lookup</Link>
          </span>
        </div>

        <div>
          {connected ? (
            <>
              <span style={{ marginRight: 10 }}>{short(address)}</span>
              <button onClick={disconnect}>Disconnect</button>
            </>
          ) : (
            <button onClick={() => connect().catch(e => alert(e.message || e))}>Connect Wallet</button>
          )}
        </div>
      </div>
    </div>
  );
}
