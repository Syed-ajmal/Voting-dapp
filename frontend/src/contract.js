import { ethers } from "ethers";
import contractJSON from "./VotingABI.json";

const contractAddress = "0x2049253a14BE1F3f65BEeB4431e3429CB15e3fA4";
const contractABI = contractJSON.abi;

export const getContract = async () => {
  if (window.ethereum) {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    return new ethers.Contract(contractAddress, contractABI, signer);
  } else {
    alert("Please install MetaMask!");
  }
};
