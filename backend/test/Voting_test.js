// test/simpleVoting.test.js
const { expect } = require("chai");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("SimpleVoting", function () {
  let voting, owner, voter1, voter2;

  beforeEach(async function () {
    [owner, voter1, voter2] = await ethers.getSigners();

    const SimpleVoting = await ethers.getContractFactory("SimpleVoting");
    voting = await SimpleVoting.deploy();
    await voting.deploymentWait?.(); // harmless if undefined
  });

  it("should create a ballot and allow votes", async function () {
    const now = await time.latest();
    const start = now;
    const end = start + 3600; // 1 hour

    // Create a ballot
    const tx = await voting.createBallot(
      "Election 2025",
      start,
      end,
      ethers.ZeroHash,
      ["Alice", "Bob", "Charlie"]
    );
    await tx.wait();

    // Voter 1 votes for Alice
    await voting.connect(voter1).vote(0, "Alice", []);
    // Voter 2 votes for Bob
    await voting.connect(voter2).vote(0, "Bob", []);

    // Fast forward time to after end
    await time.increaseTo(end + 1);

    // Finalize (anyone can after end)
    await voting.connect(voter1).finalizeBallot(0);

    const results = await voting.getResults(0);
    expect(results.length).to.equal(3);
    expect(results.map(r => Number(r))).to.eql([1, 1, 0]);

    // winners returned by ethers can be immutable; copy to a plain array first
    const raw = await voting.getWinners(0);
    // raw is [winnersArray, maxVotes]; unwrap
    const returnedWinners = raw[0];
    const maxVotes = raw[1];

    const winnersArr = [...returnedWinners].map(x => String(x));
    winnersArr.sort();
    expect(Number(maxVotes)).to.equal(1);
    expect(winnersArr).to.eql(["Alice", "Bob"]);
  });

  it("should prevent double voting", async function () {
    const now = await time.latest();
    const end = now + 3600;

    await voting.createBallot("Election", now, end, ethers.ZeroHash, ["Alice"]);
    await voting.connect(voter1).vote(0, "Alice", []);
    await expect(voting.connect(voter1).vote(0, "Alice", []))
      .to.be.revertedWith("Already voted");
  });

  it("should allow pausing", async function () {
    const now = await time.latest();
    const end = now + 3600;
    await voting.createBallot("Election", now, end, ethers.ZeroHash, ["A"]);

    // pause() is owner-only — owner (default signer) will call it
    await voting.pause();

    // expect revert with Pausable v4 message
    await expect(voting.connect(voter1).vote(0, "A", []))
      .to.be.revertedWith("Pausable: paused");

    await voting.unpause();
    await voting.connect(voter1).vote(0, "A", []);
    const res = await voting.getResults(0);
    expect(Number(res[0])).to.equal(1);
  });
});
