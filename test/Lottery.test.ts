import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import { ethers } from "hardhat";
import "@nomicfoundation/hardhat-chai-matchers";
import { Lottery, TokenNFT, USDTTestToken } from "../typechain-types";

function randomInteger(min: number, max: number) {
  let rand = min + Math.random() * (max + 1 - min);
  return Math.floor(rand);
}

enum State {
  NotActive,
  Active,
  Ready,
  DrawOver,
  Closed,
}

enum WinnerLevel {
  Jackpot,
  Level1,
  Level2,
  Level3,
  Burn,
}
describe("Lottery", function () {
  const NFTs = [
    { name: "Registration", symbol: "REG" },
    { name: "first purchase", symbol: "FPH" },
    { name: "Bring a friend", symbol: "BRF" },
    { name: "Promotion one", symbol: "PR1" },
    { name: "Promotion two", symbol: "PR2" },
    // { name: "Promotion three", symbol: "PR3" },
    // { name: "Promotion four", symbol: "PR4" },
    // { name: "Promotion five", symbol: "PR5" },
  ];

  const REWARDS = {
    jackpot: ethers.parseUnits("1000", 18),
    level1: ethers.parseUnits("100", 18),
    level2: ethers.parseUnits("10", 18),
    level3: ethers.parseUnits("1", 18),
    burn: ethers.parseUnits("0.1", 18),
  };
  const NFT_MIN_COUNT = 100;
  const NFT_MAX_COUNT = 399;

  function calculatePrizeFund(ticketCount: number) {
    const jackpot = REWARDS.jackpot;
    let count = Math.floor(ticketCount / 1000);
    count = count ? count : 1;
    const level1 = BigInt(count) * REWARDS.level1;

    count = Math.floor(ticketCount / 100);
    count = count ? count : 1;

    const level2 = BigInt(count) * REWARDS.level2;
    count = Math.floor(ticketCount / 10);
    count = count ? count : 1;

    const level3 = BigInt(count) * REWARDS.level3;

    return jackpot + level1 + level2 + level3;
  }

  async function deploy() {
    const signers = await ethers.getSigners();
    const [deployer, user1, user2, user3, ...participants] = signers;
    //Create Lottery contract
    const USDTTestTokenFactory = await ethers.getContractFactory("USDTTestToken");
    const USDTtoken: USDTTestToken = await USDTTestTokenFactory.deploy();
    await USDTtoken.waitForDeployment();

    const LotteryFactory = await ethers.getContractFactory("Lottery");
    const lottery: Lottery = await LotteryFactory.deploy(USDTtoken);
    await lottery.waitForDeployment();
    await (await USDTtoken.transfer(lottery, ethers.parseUnits("10000", 18))).wait();

    //   create NFT collections
    const TokenNFTFactory = await ethers.getContractFactory("TokenNFT");
    const collectionList: TokenNFT[] = [];
    const collectionOwners = [];
    const nftOwners = [];
    for (const [index, { name, symbol }] of NFTs.entries()) {
      const collectionOwner = signers[randomInteger(1, 3)];
      const token: TokenNFT = await TokenNFTFactory.connect(collectionOwner).deploy(
        name,
        symbol,
        collectionOwner,
        lottery,
        lottery,
        collectionOwner
      );
      collectionOwners.push(collectionOwner);
      await token.waitForDeployment();
      const tokenCounts = randomInteger(NFT_MIN_COUNT, NFT_MAX_COUNT);
      const tokenAddress = await token.getAddress();
      const currentNftOwners = [];
      for (let i = 0; i < tokenCounts; i += 1) {
        const nftOwner = signers[randomInteger(4, signers.length - 1)];
        await (await token.connect(collectionOwner).safeMint(nftOwner)).wait();
        currentNftOwners.push(nftOwner);
        const j = Math.round(((i + 1) * 20) / tokenCounts);
        const dots = ".".repeat(j);
        const left = 20 - j;
        const empty = " ".repeat(left);
        process.stdout.write(
          `\r${index + 1}/${NFTs.length}   Minting NFT for contract ${tokenAddress}: [${dots}${empty}] ${Math.round(
            ((i + 1) * 100) / tokenCounts
          )}% ${i + 1}/${tokenCounts} tokens`
        );
      }
      process.stdout.write(`\n`);
      nftOwners.push(currentNftOwners);
      collectionList.push(token);
    }

    return { lottery, collectionList, collectionOwners, nftOwners, USDTtoken, deployer, user1, user2, user3, signers };
  }
  describe("Deployment", function () {
    it("should be created", async function () {
      const { lottery, collectionList, USDTtoken } = await loadFixture(deploy);
      expect(await lottery.getAddress()).to.be.properAddress;

      for (const collection of collectionList) {
        expect(await lottery.getAddress()).to.be.properAddress;
      }
      expect(await lottery.state()).to.be.eq(State.NotActive);
      await (await lottery.setRewardToken(USDTtoken)).wait();
    });

    it("should not be added collection or execute any action if not start lottery ", async function () {
      const { lottery, collectionList } = await loadFixture(deploy);
      expect(await lottery.state()).to.be.eq(State.NotActive);
      await expect(lottery.addCollection(collectionList[0])).to.be.revertedWithCustomError(lottery, "InvalidStatus");
      await expect(lottery.readyLottery()).to.be.revertedWithCustomError(lottery, "InvalidStatus");
      await expect(lottery.lotteryDraw()).to.be.revertedWithCustomError(lottery, "InvalidStatus");
      await expect(lottery.payRewards()).to.be.revertedWithCustomError(lottery, "InvalidStatus");
      await expect(lottery.cleanCurrentDraw()).to.be.revertedWithCustomError(lottery, "InvalidStatus");
    });
  });
  describe("Start lottery", function () {
    it("should start and add-remove collection. Only DEFAULT_ADMIN_ROLE", async function () {
      const { lottery, collectionList, user1 } = await loadFixture(deploy);
      await expect(
        lottery
          .connect(user1)
          .startLottery(REWARDS.jackpot, REWARDS.level1, REWARDS.level2, REWARDS.level3, REWARDS.burn)
      ).to.be.revertedWithCustomError(lottery, "AccessControlUnauthorizedAccount");
      await (
        await lottery.startLottery(REWARDS.jackpot, REWARDS.level1, REWARDS.level2, REWARDS.level3, REWARDS.burn)
      ).wait();
      expect(await lottery.state()).to.be.eq(State.Active);
      for (let i = 0; i < collectionList.length; i += 1) {
        await (await lottery.addCollection(collectionList[i])).wait();
      }
      for (const [index, collection] of collectionList.entries()) {
        expect(await lottery.currentCollections(BigInt(index))).to.be.eq(collection);
      }
      await expect(lottery.addCollection(collectionList[0])).to.be.revertedWithCustomError(
        lottery,
        "CollectionAlreadyExist"
      );
      await (await lottery.removeCollection(collectionList[0])).wait();
      expect(lottery.currentCollections(3n)).to.be.revertedWithoutReason();
      expect(await lottery.currentCollections(0n)).to.be.eq(collectionList[collectionList.length - 1]);
      await expect(lottery.removeCollection(collectionList[0])).to.be.revertedWithCustomError(
        lottery,
        "CollectionNotExist()"
      );
      await expect(lottery.connect(user1).addCollection(collectionList[0])).to.be.revertedWithCustomError(
        lottery,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("should not be added if lottery has roles: PAUSER and BURNER.", async function () {
      const { lottery, collectionList, deployer, collectionOwners } = await loadFixture(deploy);

      const burnerRole = await collectionList[0].BURNER_ROLE();
      const pauserRole = await collectionList[0].PAUSER_ROLE();
      await (await collectionList[0].revokeRole(burnerRole, lottery)).wait();
      await (await collectionList[1].revokeRole(pauserRole, lottery)).wait();
      await (
        await lottery.startLottery(REWARDS.jackpot, REWARDS.level1, REWARDS.level2, REWARDS.level3, REWARDS.burn)
      ).wait();
      await expect(lottery.addCollection(collectionList[0])).to.be.revertedWithCustomError(
        lottery,
        "CollectionNotProvideEnoughRights"
      );
      await expect(lottery.addCollection(collectionList[0])).to.be.revertedWithCustomError(
        lottery,
        "CollectionNotProvideEnoughRights"
      );
      await (await collectionList[0].grantRole(burnerRole, lottery)).wait();
      await (await collectionList[1].grantRole(pauserRole, lottery)).wait();
      await (await lottery.addCollection(collectionList[0])).wait();
      await (await lottery.addCollection(collectionList[1])).wait();
    });
    it("token should be burned by owner. The owner receives the reward in case token has been burned", async function () {
      const { lottery, USDTtoken, collectionList, nftOwners, signers } = await loadFixture(deploy);
      await (
        await lottery.startLottery(REWARDS.jackpot, REWARDS.level1, REWARDS.level2, REWARDS.level3, REWARDS.burn)
      ).wait();
      await (await lottery.addCollection(collectionList[0])).wait();
      const owner = nftOwners[0][0];
      await expect(lottery.connect(owner).burnToken(collectionList[0], 0)).to.be.revertedWithCustomError(
        collectionList[0],
        "ERC721InsufficientApproval"
      );
      await (await collectionList[0].connect(owner).approve(lottery, 0)).wait();
      await expect(lottery.burnToken(collectionList[0], 0)).to.be.revertedWithCustomError(lottery, "NotNFTOwner");
      const tx = await lottery.connect(owner).burnToken(collectionList[0], 0);
      tx.wait();
      await expect(tx).to.changeTokenBalances(USDTtoken, [lottery, owner], [-REWARDS.burn, REWARDS.burn]);
      await expect(tx).to.changeTokenBalance(collectionList[0], owner, -1);
      await expect(lottery.connect(nftOwners[1][0]).burnToken(collectionList[1], 0)).to.be.revertedWithCustomError(
        lottery,
        "CollectionNotExist"
      );
    });
    it("should be obtained the calculation of the prize fund ", async function () {
      const { lottery, collectionList, nftOwners, signers } = await loadFixture(deploy);
      await (
        await lottery.startLottery(REWARDS.jackpot, REWARDS.level1, REWARDS.level2, REWARDS.level3, REWARDS.burn)
      ).wait();
      for (const collection of collectionList) {
        await (await lottery.addCollection(collection)).wait();
      }
      const totalTickets = nftOwners.reduce((acc, elem) => acc + elem.length, 0);
      //   console.log(calculatePrizeFund(totalTickets));
      expect(await lottery.getPrizeFundVolume()).to.be.eq(calculatePrizeFund(totalTickets));
      const burnTokenCount = Math.floor(nftOwners[0].length / 2);
      for (let i = 0; i < burnTokenCount; i += 1) {
        await (await collectionList[0].connect(nftOwners[0][i]).approve(lottery, BigInt(i))).wait();
        await (await lottery.connect(nftOwners[0][i]).burnToken(collectionList[0], BigInt(i))).wait();
      }
      expect(await lottery.getPrizeFundVolume()).to.be.eq(calculatePrizeFund(totalTickets - burnTokenCount));
      await (await lottery.removeCollection(collectionList[0])).wait();
      expect(await lottery.getPrizeFundVolume()).to.be.eq(calculatePrizeFund(totalTickets - nftOwners[0].length));
      await (await lottery.addCollection(collectionList[0])).wait();
      expect(await lottery.getPrizeFundVolume()).to.be.eq(calculatePrizeFund(totalTickets - burnTokenCount));
    });
  });
  describe("Lottery ready for draw", function () {
    it("should freeze collections before draw", async function () {
      const { lottery, collectionList, nftOwners, signers } = await loadFixture(deploy);
      await (
        await lottery.startLottery(REWARDS.jackpot, REWARDS.level1, REWARDS.level2, REWARDS.level3, REWARDS.burn)
      ).wait();
      for (const [index, collection] of collectionList.entries()) {
        if (index) {
          await (await lottery.addCollection(collection)).wait();
        }
      }
      await (await lottery.readyLottery()).wait();
      expect(await lottery.state()).to.be.eq(State.Ready);
      await expect(lottery.addCollection(collectionList[0])).to.be.revertedWithCustomError(lottery, "InvalidStatus");
      await expect(lottery.removeCollection(collectionList[1])).to.be.revertedWithCustomError(lottery, "InvalidStatus");
      await expect(collectionList[1].safeMint(signers[0])).to.be.revertedWithCustomError(
        collectionList[1],
        "EnforcedPause"
      );
      await (await collectionList[1].connect(nftOwners[1][0]).approve(lottery, 0n)).wait();
      await expect(collectionList[1].connect(nftOwners[1][0]).burn(0n)).to.be.revertedWithCustomError(
        collectionList[1],
        "AccessControlUnauthorizedAccount"
      );
      expect(lottery.connect(nftOwners[1][0]).burnToken(collectionList[1], 0n)).to.be.revertedWithCustomError(
        lottery,
        "InvalidStatus"
      );
    });
  });
  describe("Lottery draw", function () {
    it("should be drawn", async function () {
      const { lottery, collectionList, nftOwners, signers } = await loadFixture(deploy);
      await (
        await lottery.startLottery(REWARDS.jackpot, REWARDS.level1, REWARDS.level2, REWARDS.level3, REWARDS.burn)
      ).wait();
      for (const [index, collection] of collectionList.entries()) {
        await (await lottery.addCollection(collection)).wait();
      }
      const burnTokenCount = Math.floor(nftOwners[0].length / 2);
      for (let i = 0; i < burnTokenCount; i += 1) {
        await (await collectionList[0].connect(nftOwners[0][i]).approve(lottery, BigInt(i))).wait();
        await (await lottery.connect(nftOwners[0][i]).burnToken(collectionList[0], BigInt(i))).wait();
      }
      await (await lottery.readyLottery()).wait();
      const calculatePrizeFund = await lottery.getPrizeFundVolume();
      const roundNumber = await lottery.drawNumber();
      const tx = await lottery.lotteryDraw();
      await tx.wait();
      for (const level of [WinnerLevel.Jackpot, WinnerLevel.Level1, WinnerLevel.Level2, WinnerLevel.Level3]) {
        await expect(tx).to.emit(lottery, "Lottery_Draw_Started").withArgs(roundNumber, level);
        await expect(tx).to.emit(lottery, "Lottery_Draw_Finished").withArgs(roundNumber, level);
      }
      const result = await lottery.getWinnerPayoutList();
      const resultPrizeFund = result.reduce((acc, [_, amount]) => acc + amount, 0n);
      expect(resultPrizeFund).to.be.eq(calculatePrizeFund);
    });
  });
  describe("Lottery draw over", function () {
    it("should be transfer rewards", async function () {
      const { lottery, collectionList, USDTtoken } = await loadFixture(deploy);
      await (
        await lottery.startLottery(REWARDS.jackpot, REWARDS.level1, REWARDS.level2, REWARDS.level3, REWARDS.burn)
      ).wait();
      for (const [index, collection] of collectionList.entries()) {
        await (await lottery.addCollection(collection)).wait();
      }
      await (await lottery.readyLottery()).wait();
      const calculatePrizeFund = await lottery.getPrizeFundVolume();
      await (await lottery.lotteryDraw()).wait();

      const roundNumber = await lottery.drawNumber();
      const result = await lottery.getWinnerPayoutList();
      const tx = await lottery.payRewards();
      tx.wait();
      await expect(tx).to.be.changeTokenBalance(USDTtoken, lottery, -calculatePrizeFund);
      for (const [winner, amount] of result) {
        await expect(tx).to.be.changeTokenBalance(USDTtoken, winner, amount);
        await expect(tx).to.emit(lottery, "TransferReward").withArgs(roundNumber, winner, amount);
      }
    });
  });
  describe("Lottery closed", function () {
    it("should be change state to NotActive and clean winner's list", async function () {
      const { lottery, collectionList, USDTtoken, deployer, user1 } = await loadFixture(deploy);
      await (await lottery.startLottery(REWARDS.jackpot, REWARDS.level1, REWARDS.level2, 0n, REWARDS.burn)).wait();
      for (const [index, collection] of collectionList.entries()) {
        await (await lottery.addCollection(collection)).wait();
      }
      await (await lottery.readyLottery()).wait();
      await (await lottery.lotteryDraw()).wait();

      const roundNumber = await lottery.drawNumber();
      const result = await lottery.getWinnerPayoutList();
      await (await lottery.payRewards()).wait();
      expect(await lottery.state()).to.be.eq(State.Closed);
      await (await lottery.cleanCurrentDraw()).wait();
      expect(await lottery.state()).to.be.eq(State.NotActive);
      expect(await lottery.getWinnerPayoutList()).to.be.empty;
      await expect(
        lottery.connect(user1)["withdrawRewardTokens(address,uint256)"](user1, ethers.parseUnits("1", 18))
      ).to.be.revertedWithCustomError(lottery, "AccessControlUnauthorizedAccount");
      let tx = await lottery["withdrawRewardTokens(address,uint256)"](user1, ethers.parseUnits("1", 18));
      await tx.wait();
      await expect(tx).to.be.changeTokenBalances(
        USDTtoken,
        [user1, lottery],
        [ethers.parseUnits("1", 18), -ethers.parseUnits("1", 18)]
      );
      tx = await lottery["withdrawRewardTokens(uint256)"](ethers.parseUnits("1", 18));
      await tx.wait();
      await expect(tx).to.be.changeTokenBalances(
        USDTtoken,
        [deployer, lottery],
        [ethers.parseUnits("1", 18), -ethers.parseUnits("1", 18)]
      );
      const balance = await USDTtoken.balanceOf(lottery);
      tx = await lottery["withdrawRewardTokens()"]();
      await tx.wait();
      await expect(tx).to.be.changeTokenBalances(USDTtoken, [deployer, lottery], [balance, -balance]);
    });
  });
  describe("New Lottery round", function () {
    it("should be change state to NotActive and clean winner's list", async function () {
      const { lottery, collectionList, USDTtoken, nftOwners } = await loadFixture(deploy);
      await (
        await lottery.startLottery(REWARDS.jackpot, REWARDS.level1, REWARDS.level2, REWARDS.level2, REWARDS.burn)
      ).wait();
      for (const [index, collection] of collectionList.entries()) {
        if (index <= 2) {
          await (await lottery.addCollection(collection)).wait();
        }
      }
      const ticketCountsList = nftOwners.map((elem) => elem.length);

      const totalTickets = ticketCountsList.reduce((acc, elem) => acc + elem, 0);

      const burnTokenCount = Math.floor(nftOwners[0].length / 2);
      for (let i = 0; i < burnTokenCount; i += 1) {
        await (await collectionList[0].connect(nftOwners[0][i]).approve(lottery, BigInt(i))).wait();
        await (await lottery.connect(nftOwners[0][i]).burnToken(collectionList[0], BigInt(i))).wait();
      }
      await (await lottery.removeCollection(collectionList[0])).wait();
      await (await lottery.readyLottery()).wait();

      await (await lottery.lotteryDraw()).wait();
      //   const result = await lottery.getWinnerPayoutList();
      await (await lottery.payRewards()).wait();
      expect(await lottery.state()).to.be.eq(State.Closed);
      await (await lottery.cleanCurrentDraw()).wait();
      expect(await lottery.state()).to.be.eq(State.NotActive);
      await (
        await lottery.startLottery(REWARDS.jackpot, REWARDS.level1, REWARDS.level2, REWARDS.level3, REWARDS.burn)
      ).wait();
      for (const [index, collection] of collectionList.entries()) {
        if (index > 2) {
          await (await lottery.addCollection(collection)).wait();
        }
      }
      await expect(lottery.addCollection(collectionList[1])).to.be.revertedWithCustomError(
        lottery,
        "CollectionAlreadyParticipated"
      );
      await (await lottery.addCollection(collectionList[0])).wait();
      await (await lottery.readyLottery()).wait();
      const TicketsCountRoundTwo = totalTickets - ticketCountsList[1] - ticketCountsList[2] - burnTokenCount;
      const calculatedPrizeFund = calculatePrizeFund(TicketsCountRoundTwo);
      const PrizeFund = await lottery.getPrizeFundVolume();
      expect(PrizeFund).to.be.eq(calculatedPrizeFund);
      await (await lottery.lotteryDraw()).wait();
      const result = await lottery.getWinnerPayoutList();
      const resultPrizeFund = result.reduce((acc, [_, amount]) => acc + amount, 0n);
      expect(PrizeFund).to.be.eq(resultPrizeFund);
    });
  });
});
