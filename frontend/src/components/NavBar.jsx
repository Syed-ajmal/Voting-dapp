// src/components/NavBar.jsx
import React, { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import { useTheme } from "../context/ThemeContext";
import { getReadOnlyContract } from "../api/contract";

export default function NavBar() {
  const { address, connected, connect, disconnect } = useWallet();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();
  const [isOwner, setIsOwner] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const short = (a) => (a ? `${a.slice(0, 6)}...${a.slice(-4)}` : "");

  const isActive = (path) => location.pathname === path;

  // Close mobile menu when route changes
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  // Check if connected wallet is owner
  useEffect(() => {
    let mounted = true;

    async function checkOwner() {
      if (!address) {
        if (mounted) setIsOwner(false);
        return;
      }

      try {
        const { contract } = await getReadOnlyContract();
        const ownerAddress = await contract.owner();
        if (mounted) {
          setIsOwner(ownerAddress.toLowerCase() === address.toLowerCase());
        }
      } catch (err) {
        console.error("Failed to check owner:", err);
        if (mounted) setIsOwner(false);
      }
    }

    checkOwner();
    return () => { mounted = false; };
  }, [address]);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" className="navbar-brand" onClick={() => setMobileMenuOpen(false)}>
          SimpleVoting
        </Link>
        
        <button 
          className="navbar-toggle"
          onClick={toggleMobileMenu}
          aria-label="Toggle menu"
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>

        <ul className={`navbar-nav ${mobileMenuOpen ? 'open' : ''}`}>
          <li>
            <Link to="/" className={`navbar-link ${isActive("/") ? "active" : ""}`}>
              Home
            </Link>
          </li>
          {isOwner && (
            <li>
              <Link to="/create" className={`navbar-link ${isActive("/create") ? "active" : ""}`}>
                Create
              </Link>
            </li>
          )}
          <li>
            <Link to="/vote" className={`navbar-link ${isActive("/vote") ? "active" : ""}`}>
              Vote
            </Link>
          </li>
          <li>
            <Link to="/results" className={`navbar-link ${isActive("/results") ? "active" : ""}`}>
              Results
            </Link>
          </li>
          {isOwner && (
            <>
              <li>
                <Link to="/admin" className={`navbar-link ${isActive("/admin") ? "active" : ""}`}>
                  Admin
                </Link>
              </li>
              <li>
                <Link to="/merkle" className={`navbar-link ${isActive("/merkle") ? "active" : ""}`}>
                  Merkle
                </Link>
              </li>
            </>
          )}
          <li>
            <Link to="/proof-lookup" className={`navbar-link ${isActive("/proof-lookup") ? "active" : ""}`}>
              Proof Lookup
            </Link>
          </li>
          <li>
            <Link to="/about" className={`navbar-link ${isActive("/about") ? "active" : ""}`}>
              About
            </Link>
          </li>

          {/* Mobile actions inside menu */}
          <li className="navbar-actions-mobile">
            <button 
              className="btn btn-ghost btn-sm btn-full"
              onClick={() => {
                toggleTheme();
                setMobileMenuOpen(false);
              }}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {theme === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
            </button>
            {connected ? (
              <>
                <div className="wallet-address">
                  {short(address)}
                </div>
                <button 
                  className="btn btn-secondary btn-sm btn-full" 
                  onClick={() => {
                    disconnect();
                    setMobileMenuOpen(false);
                  }}
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button 
                className="btn btn-primary btn-sm btn-full"
                onClick={() => {
                  connect().catch(e => alert(e.message || e));
                  setMobileMenuOpen(false);
                }}
              >
                Connect Wallet
              </button>
            )}
          </li>
        </ul>

        {/* Desktop actions */}
        <div className="navbar-actions">
          <button 
            className="btn btn-ghost btn-sm"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          {connected ? (
            <>
              <span className="wallet-address">{short(address)}</span>
              <button className="btn btn-secondary btn-sm" onClick={disconnect}>
                Disconnect
              </button>
            </>
          ) : (
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => connect().catch(e => alert(e.message || e))}
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
