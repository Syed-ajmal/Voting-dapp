// scripts/checkOwner.js
const { ethers } = require("hardhat");

async function main() {
  const addr = process.env.CONTRACT_ADDRESS;
  const c = await ethers.getContractAt("SimpleVoting", addr);
  console.log("Owner:", await c.owner());
}

main().catch(e => { console.error(e); process.exit(1); });


//CONTRACT="0x591ED732628b760Ecf5562f505a85E8Ce2E1d5AC" npx hardhat run scripts/checkOwner.js --network sepolia
