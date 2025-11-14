// src/pages/About.jsx
import React from "react";

export default function About() {
  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">About SimpleVoting</h1>
        <p className="page-subtitle">A decentralized voting platform built on blockchain technology</p>
      </div>

      <div className="card mb-6">
        <h2 className="mb-4">Overview</h2>
        <p>
          SimpleVoting is a blockchain-based decentralized application (DApp) that enables secure, 
          transparent, and tamper-proof voting. Built on Ethereum-compatible networks, it leverages 
          smart contracts to ensure the integrity of the voting process.
        </p>
        <p>
          This platform provides a robust solution for conducting elections, polls, and governance 
          decisions with complete transparency and verifiability on the blockchain.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <h3 className="card-title">🔒 Security</h3>
          <p className="card-body">
            All votes are recorded on the blockchain, making them immutable and verifiable. 
            Cryptographic proofs ensure vote integrity and prevent tampering.
          </p>
        </div>

        <div className="card">
          <h3 className="card-title">🌐 Transparency</h3>
          <p className="card-body">
            Every transaction and vote is publicly verifiable on the blockchain, providing 
            complete transparency while maintaining voter privacy through cryptographic techniques.
          </p>
        </div>

        <div className="card">
          <h3 className="card-title">⚡ Decentralized</h3>
          <p className="card-body">
            No single point of failure. The voting system runs on a distributed network, 
            ensuring availability and resistance to censorship.
          </p>
        </div>

        <div className="card">
          <h3 className="card-title">✅ Verifiable</h3>
          <p className="card-body">
            Results can be independently verified by anyone. The smart contract logic is 
            open-source and auditable, ensuring trust in the voting process.
          </p>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="mb-4">Features</h2>
        <ul>
          <li>
            <strong>Ballot Creation:</strong> Contract owners can create new voting ballots with 
            custom candidates, start/end times, and optional Merkle tree whitelisting.
          </li>
          <li>
            <strong>Secure Voting:</strong> Users connect their wallets to cast votes, with 
            cryptographic verification of each transaction.
          </li>
          <li>
            <strong>Real-time Results:</strong> View live vote counts and finalize ballots 
            to determine winners.
          </li>
          <li>
            <strong>Merkle Tree Support:</strong> Optional whitelist functionality using 
            Merkle proofs for restricted voting.
          </li>
          <li>
            <strong>Admin Controls:</strong> Contract owners can pause/unpause the contract, 
            extend ballot end times, update Merkle roots, and finalize ballots.
          </li>
        </ul>
      </div>

      <div className="card mb-6">
        <h2 className="mb-4">How It Works</h2>
        <div className="mb-4">
          <h4 className="mb-2">1. Ballot Creation</h4>
          <p>
            The contract owner creates a new ballot by specifying the title, start/end times, 
            candidates, and optionally a Merkle root for whitelisted voting.
          </p>
        </div>
        <div className="mb-4">
          <h4 className="mb-2">2. Voting Period</h4>
          <p>
            During the voting window, eligible voters can connect their wallets and cast their 
            votes. Each vote is recorded as a transaction on the blockchain.
          </p>
        </div>
        <div className="mb-4">
          <h4 className="mb-2">3. Results & Finalization</h4>
          <p>
            After the voting period ends, the contract owner can finalize the ballot. Once 
            finalized, winners can be determined and the results become permanent.
          </p>
        </div>
      </div>

      <div className="card mb-6">
        <h2 className="mb-4">Technical Details</h2>
        <div className="mb-4">
          <h4 className="mb-2">Smart Contract</h4>
          <p>
            The SimpleVoting contract is deployed on an Ethereum-compatible network. It handles 
            ballot creation, voting, vote counting, and administrative functions.
          </p>
        </div>
        <div className="mb-4">
          <h4 className="mb-2">Network</h4>
          <p>
            Currently deployed on: <span className="address">
              {process.env.REACT_APP_NETWORK_NAME || "Sepolia Testnet"}
            </span>
          </p>
        </div>
        <div>
          <h4 className="mb-2">Contract Address</h4>
          <p>
            <span className="address">
              {process.env.REACT_APP_CONTRACT_ADDRESS || "Not configured"}
            </span>
          </p>
        </div>
      </div>

      <div className="card">
        <h2 className="mb-4">Disclaimer</h2>
        <p>
          This is an academic project demonstrating blockchain-based voting systems. 
          While the smart contract implements security best practices, it should be thoroughly 
          audited before use in production environments.
        </p>
        <p className="mt-4">
          <strong>Note:</strong> Always verify contract addresses and network information 
          before participating in any voting process.
        </p>
      </div>
    </div>
  );
}

