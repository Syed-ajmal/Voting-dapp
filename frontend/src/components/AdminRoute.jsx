// src/components/AdminRoute.jsx
import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useWallet } from "../context/WalletContext";
import { getReadOnlyContract } from "../api/contract";

/**
 * AdminRoute - Protects routes that require contract owner access
 * Checks if connected wallet is the contract owner
 */
export default function AdminRoute({ children }) {
  const { address: connectedAddress } = useWallet();
  const [isOwner, setIsOwner] = useState(null); // null = checking, true/false = known
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function checkOwner() {
      setLoading(true);
      try {
        const { contract } = await getReadOnlyContract();
        const ownerAddress = await contract.owner();
        
        if (mounted) {
          const owner = connectedAddress && 
            ownerAddress.toLowerCase() === connectedAddress.toLowerCase();
          setIsOwner(owner);
        }
      } catch (err) {
        console.error("Failed to check owner:", err);
        if (mounted) {
          setIsOwner(false);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    checkOwner();
    return () => { mounted = false; };
  }, [connectedAddress]);

  if (loading) {
    return (
      <div className="container">
        <div className="page">
          <div className="card">
            <div className="flex items-center justify-center gap-3">
              <span className="spinner"></span>
              <span>Checking admin access...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="container">
        <div className="page">
          <div className="card">
            <h2 className="card-title">Access Denied</h2>
            <p className="card-body">
              This page is only accessible to the contract owner. Please connect the owner wallet to continue.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return children;
}

