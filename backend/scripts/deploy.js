const hre = require("hardhat");

async function main() {
    const SimpleVoting = await hre.ethers.getContractFactory("SimpleVoting");
    const Contract = await SimpleVoting.deploy();
    await Contract.waitForDeployment(); 

    console.log("Contract address = ", await Contract.getAddress());
}

//contract address
//0x591ED732628b760Ecf5562f505a85E8Ce2E1d5AC

main()
    .then(() => process.exit(0))
    .catch((error) => {
    console.error(error);
    process.exitCode = 1;
});