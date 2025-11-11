// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

/// @title SimpleVoting
/// @notice Owner can create ballots with named candidates. Voters vote by candidate name. Supports Merkle whitelists, pausing, and tie-aware winner reporting.
contract SimpleVoting is Ownable, Pausable {

    // OZ v4: Ownable's constructor sets owner = msg.sender automatically.
    constructor() {}

    struct Ballot {
        string title;
        uint256 startTimestamp;
        uint256 endTimestamp;
        bytes32 merkleRoot; // zero if open to all
        string[] candidateNames;
        bool exists;
        bool finalized;
    }

    mapping(uint256 => Ballot) public ballots;
    mapping(uint256 => mapping(uint256 => uint256)) public candidateVotes;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(bytes32 => uint256)) private nameHashToIdPlusOne;

    uint256 public nextBallotId;

    event BallotCreated(
        uint256 indexed ballotId,
        string title,
        uint256 start,
        uint256 end,
        bytes32 merkleRoot,
        string[] candidateNames
    );
    event Voted(uint256 indexed ballotId, address indexed voter, uint256 optionId, string candidateName);
    event BallotFinalized(uint256 indexed ballotId);
    event BallotExtended(uint256 indexed ballotId, uint256 oldEnd, uint256 newEnd);
    event MerkleRootUpdated(uint256 indexed ballotId, bytes32 oldRoot, bytes32 newRoot);

    modifier ballotExists(uint256 ballotId) {
        require(ballots[ballotId].exists, "Ballot not found");
        _;
    }

    modifier duringVoting(uint256 ballotId) {
        Ballot storage b = ballots[ballotId];
        require(block.timestamp >= b.startTimestamp, "Voting not started");
        require(block.timestamp <= b.endTimestamp, "Voting ended");
        _;
    }

    function createBallot(
        string calldata title,
        uint256 startTimestamp,
        uint256 endTimestamp,
        bytes32 merkleRoot,
        string[] calldata candidateNames
    ) external onlyOwner whenNotPaused returns (uint256) {
        require(startTimestamp < endTimestamp, "Bad time range");
        require(candidateNames.length > 0, "Need at least one candidate");

        uint256 id = nextBallotId++;
        Ballot storage b = ballots[id];
        b.title = title;
        b.startTimestamp = startTimestamp;
        b.endTimestamp = endTimestamp;
        b.merkleRoot = merkleRoot;
        b.exists = true;
        b.finalized = false;

        for (uint256 i = 0; i < candidateNames.length; i++) {
            bytes32 h = keccak256(bytes(candidateNames[i]));
            require(nameHashToIdPlusOne[id][h] == 0, "Duplicate candidate name");
            b.candidateNames.push(candidateNames[i]);
            nameHashToIdPlusOne[id][h] = i + 1;
        }

        emit BallotCreated(id, title, startTimestamp, endTimestamp, merkleRoot, candidateNames);
        return id;
    }

    function vote(
        uint256 ballotId,
        string calldata candidateName,
        bytes32[] calldata merkleProof
    )
        external
        ballotExists(ballotId)
        duringVoting(ballotId)
        whenNotPaused
    {
        Ballot storage b = ballots[ballotId];
        require(!b.finalized, "Ballot finalized");
        require(!hasVoted[ballotId][msg.sender], "Already voted");

        if (b.merkleRoot != bytes32(0)) {
            bytes32 leaf = keccak256(abi.encodePacked(msg.sender));
            require(MerkleProof.verify(merkleProof, b.merkleRoot, leaf), "Not eligible");
        }

        bytes32 h = keccak256(bytes(candidateName));
        uint256 idPlusOne = nameHashToIdPlusOne[ballotId][h];
        require(idPlusOne != 0, "Candidate not found");
        uint256 id = idPlusOne - 1;

        candidateVotes[ballotId][id] += 1;
        hasVoted[ballotId][msg.sender] = true;

        emit Voted(ballotId, msg.sender, id, candidateName);
    }

    function finalizeBallot(uint256 ballotId) external ballotExists(ballotId) {
        Ballot storage b = ballots[ballotId];
        require(!b.finalized, "Already finalized");
        if (msg.sender != owner()) {
            require(block.timestamp > b.endTimestamp, "Voting not ended");
        }
        b.finalized = true;
        emit BallotFinalized(ballotId);
    }

    function extendBallotEnd(uint256 ballotId, uint256 newEndTimestamp)
        external
        onlyOwner
        ballotExists(ballotId)
        whenNotPaused
    {
        Ballot storage b = ballots[ballotId];
        require(!b.finalized, "Already finalized");
        require(newEndTimestamp > b.endTimestamp, "New end must be later");

        uint256 old = b.endTimestamp;
        b.endTimestamp = newEndTimestamp;
        emit BallotExtended(ballotId, old, newEndTimestamp);
    }

    function updateMerkleRoot(uint256 ballotId, bytes32 newRoot)
        external
        onlyOwner
        ballotExists(ballotId)
        whenNotPaused
    {
        Ballot storage b = ballots[ballotId];
        require(!b.finalized, "Already finalized");

        bytes32 old = b.merkleRoot;
        b.merkleRoot = newRoot;
        emit MerkleRootUpdated(ballotId, old, newRoot);
    }

    function pause() external onlyOwner { _pause(); }
    function unpause() external onlyOwner { _unpause(); }

    function candidateCount(uint256 ballotId) external view ballotExists(ballotId) returns (uint256) {
        return ballots[ballotId].candidateNames.length;
    }

    function getCandidateName(uint256 ballotId, uint256 index)
        external
        view
        ballotExists(ballotId)
        returns (string memory)
    {
        Ballot storage b = ballots[ballotId];
        require(index < b.candidateNames.length, "Invalid candidate index");
        return b.candidateNames[index];
    }

    function findCandidateIdByName(uint256 ballotId, string calldata candidateName)
        external
        view
        ballotExists(ballotId)
        returns (bool, uint256)
    {
        bytes32 h = keccak256(bytes(candidateName));
        uint256 idPlusOne = nameHashToIdPlusOne[ballotId][h];
        if (idPlusOne == 0) return (false, type(uint256).max);
        return (true, idPlusOne - 1);
    }

    function getVotes(uint256 ballotId, uint256 candidateIndex)
        external
        view
        ballotExists(ballotId)
        returns (uint256)
    {
        return candidateVotes[ballotId][candidateIndex];
    }

    function getVotesByName(uint256 ballotId, string calldata candidateName)
        external
        view
        ballotExists(ballotId)
        returns (uint256)
    {
        bytes32 h = keccak256(bytes(candidateName));
        uint256 idPlusOne = nameHashToIdPlusOne[ballotId][h];
        require(idPlusOne != 0, "Candidate not found");
        return candidateVotes[ballotId][idPlusOne - 1];
    }

    function getResults(uint256 ballotId) external view ballotExists(ballotId) returns (uint256[] memory) {
        Ballot storage b = ballots[ballotId];
        uint256 n = b.candidateNames.length;
        uint256[] memory res = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            res[i] = candidateVotes[ballotId][i];
        }
        return res;
    }

    function getBallot(uint256 ballotId)
        external
        view
        ballotExists(ballotId)
        returns (
            string memory title,
            uint256 startTimestamp,
            uint256 endTimestamp,
            bytes32 merkleRoot,
            uint256 candidateCount_,
            bool finalized
        )
    {
        Ballot storage b = ballots[ballotId];
        return (b.title, b.startTimestamp, b.endTimestamp, b.merkleRoot, b.candidateNames.length, b.finalized);
    }

    function hasUserVoted(uint256 ballotId, address user)
        external
        view
        ballotExists(ballotId)
        returns (bool)
    {
        return hasVoted[ballotId][user];
    }

    function getWinners(uint256 ballotId)
        external
        view
        ballotExists(ballotId)
        returns (string[] memory winners, uint256 winningVotes)
    {
        Ballot storage b = ballots[ballotId];
        require(b.finalized, "Ballot not finalized");

        uint256 n = b.candidateNames.length;
        if (n == 0) {
            return (new string[](0), 0);
        }

        uint256 maxVotes = 0;
        for (uint256 i = 0; i < n; i++) {
            uint256 v = candidateVotes[ballotId][i];
            if (v > maxVotes) {
                maxVotes = v;
            }
        }

        if (maxVotes == 0) {
            return (new string[](0), 0);
        }

        uint256 winnersCount = 0;
        for (uint256 i = 0; i < n; i++) {
            if (candidateVotes[ballotId][i] == maxVotes) {
                winnersCount++;
            }
        }

        string[] memory names = new string[](winnersCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < n; i++) {
            if (candidateVotes[ballotId][i] == maxVotes) {
                names[idx++] = b.candidateNames[i];
            }
        }

        return (names, maxVotes);
    }
}
