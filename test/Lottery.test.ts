import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import "@nomicfoundation/hardhat-chai-matchers";
import { Lottery, TokenNFT } from "../typechain-types";
import { TokenNFTInterface } from "../typechain-types/contracts/TokenNFT";

function randomInteger(min: number, max: number) {
  let rand = min + Math.random() * (max + 1 - min);
  return Math.floor(rand);
}

describe("Lottery", function () {
  const NFTs = [
    { name: "Registration", symbol: "REG" },
    { name: "first purchase", symbol: "FPH" },
    { name: "Bring a friend", symbol: "BRF" },
    { name: "Promotion one", symbol: "PR1" },
    // { name: "Promotion two", symbol: "PR2" },
    // { name: "Promotion three", symbol: "PR3" },
    // { name: "Promotion four", symbol: "PR4" },
    // { name: "Promotion five", symbol: "PR5" },
  ];
  async function deploy() {
    const signers = await ethers.getSigners();
    const [deployer, user1, user2, user3, ...participants] = signers;
    //Create Lottery contract
    const LotteryFactory = await ethers.getContractFactory("Lottery");
    const lottery: Lottery = await LotteryFactory.deploy();
    await lottery.waitForDeployment();
    const lotteryAddress = await lottery.getAddress();

    //   create NFT
    const TokenNFTFactory = await ethers.getContractFactory("TokenNFT");
    const collectionList: TokenNFT[] = [];

    for (const { name, symbol } of NFTs) {
      const collectionOwner = signers[randomInteger(1, 3)];
      const token: TokenNFT = await TokenNFTFactory.connect(collectionOwner).deploy(
        name,
        symbol,
        collectionOwner,
        lottery,
        collectionOwner
      );
      await token.waitForDeployment();
      const tokenCounts = randomInteger(99, 599);
      console.log(`minting ${await token.getAddress()}`, tokenCounts);
      for (let i = 0; i < tokenCounts; i += 1) {
        await (await token.connect(collectionOwner).safeMint(signers[randomInteger(4, signers.length - 1)])).wait();
      }
      collectionList.push(token);
    }

    return { lottery, collectionList, deployer, user1, user2, user3, signers };
  }
  describe("Deployment", function () {
    it("should be created", async function () {
      const { lottery, collectionList, deployer, user1, user2, user3, signers } = await loadFixture(deploy);
      await (await lottery.startLottery(100000, 10000, 1000, 10, 1)).wait();
      await (await lottery.addCollection(collectionList[0])).wait();
      await (await lottery.addCollection(collectionList[2])).wait();
      await (await lottery.addCollection(collectionList[3])).wait();
      console.log(await lottery.getPrizeFundVolume());
      await (await lottery.readyLottery()).wait();
      await (await lottery.lotteryDraw()).wait();

      console.log(await lottery.getWinnerPayoutList());

      await (await lottery.payRewards()).wait();
      await (await lottery.cleanCurrentDraw()).wait();
    });
  });
});
