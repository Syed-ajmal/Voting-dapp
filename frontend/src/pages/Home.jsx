// src/pages/Home.jsx
import React from "react";
import BallotList from "../components/BallotList";

export default function Home() {
  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Ballots</h1>
        <p className="page-subtitle">Search and view available voting ballots</p>
      </div>
      <BallotList />
    </div>
  );
}
