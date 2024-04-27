// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "./TokenNFT.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Lottery is AccessControl {
  error CollectionAlreadyExist();
  error CollectionAlreadyParticipated();
  error CollectionNotExist();
  error CollectionAlreadyUsed();
  error InvalidStatus();
  error CollectionNotProvideEnoughRights();

  event Won_NFT_Number(uint32 indexed _number, WinnerLevel indexed _level, address indexed _collection, uint _id);
  event Lottery_Draw_Started(uint32 indexed _number, WinnerLevel indexed _level);
  event Lottery_Draw_Finished(uint32 indexed _number, WinnerLevel indexed _level);
  event New_Lottery_State(State _state);
  event TransferReward(uint32 indexed _number, address indexed _winner, uint _amount);

  enum State {
    NotActive,
    Active,
    Ready,
    DrawOver,
    Closed
  }

  enum WinnerLevel {
    Jackpot,
    Level1,
    Level2,
    Level3,
    Burn
  }

  struct LotteryLevel {
    WinnerLevel name;
    uint divider;
    uint amount;
  }

  struct Item {
    address collection;
    uint number;
  }

  uint32 drawNumber;
  IERC20 private _tokenReward;
  mapping(address => bool) private _participatedCollections;
  mapping(address => bool) private _currentCollections;
  TokenNFT[] public currentCollections;

  mapping(address => mapping(uint => bool)) private _unavailableTokens;
  mapping(address => uint) private _burnedTokenCountByContract;
  uint private _unavailableTokenCount;

  LotteryLevel[4] private _loterryLevel;
  State private _state;
  address[] public winners;
  mapping(address => uint256) private _winnerRewards;
  uint public burnReward;

  constructor(IERC20 tokenReward) {
    _tokenReward = tokenReward;
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    _loterryLevel[0].name = WinnerLevel.Level3;
    _loterryLevel[1].name = WinnerLevel.Level2;
    _loterryLevel[2].name = WinnerLevel.Level1;
    _loterryLevel[3].name = WinnerLevel.Jackpot;
    _loterryLevel[0].divider = 10;
    _loterryLevel[1].divider = 100;
    _loterryLevel[2].divider = 1000;
    _state = State.NotActive;
    emit New_Lottery_State(_state);
  }

  modifier onlyState(State state) {
    if (_state != state) {
      revert InvalidStatus();
    }
    _;
  }

  function getWinnerPayoutList() external view returns (Item[] memory) {
    Item[] memory winnerPayoutList = new Item[](winners.length);
    for (uint i = 0; i < winners.length; i += 1) {
      winnerPayoutList[i].collection = winners[i];
      winnerPayoutList[i].number = _winnerRewards[winnerPayoutList[i].collection];
    }
    return winnerPayoutList;
  }

  function getPrizeFundVolume() external view returns (uint) {
    uint volume;
    uint totalTickets;
    (totalTickets, ) = _getCollectionsLength();
    for (uint8 level; level < 4; level += 1) {
      if (_loterryLevel[level].divider == 0) {
        volume += _loterryLevel[level].amount;
      } else {
        uint winnerCount = totalTickets / _loterryLevel[level].divider;
        if (winnerCount == 0) {
          winnerCount = 1;
        }
        volume += winnerCount * _loterryLevel[level].amount;
      }
    }
    for (uint i; i < currentCollections.length; i += 1) {
      volume += _burnedTokenCountByContract[address(currentCollections[i])];
    }

    return volume;
  }

  function getLotteryStatus() external view returns (State) {
    return _state;
  }

  function startLottery(
    uint x,
    uint y,
    uint z,
    uint j,
    uint b
  ) external onlyRole(DEFAULT_ADMIN_ROLE) onlyState(State.NotActive) {
    _state = State.Active;
    _loterryLevel[0].amount = j;
    _loterryLevel[1].amount = z;
    _loterryLevel[2].amount = y;
    _loterryLevel[3].amount = x;
    burnReward = b;
    drawNumber += 1;
    emit New_Lottery_State(_state);
  }

  function readyLottery() external onlyRole(DEFAULT_ADMIN_ROLE) onlyState(State.Active) {
    _state = State.Ready;
    _pause(true);
    emit New_Lottery_State(_state);
  }

  function addCollection(address collection) external onlyRole(DEFAULT_ADMIN_ROLE) onlyState(State.Active) {
    if (_currentCollections[collection]) {
      revert CollectionAlreadyExist();
    }
    if (_participatedCollections[collection]) {
      revert CollectionAlreadyParticipated();
    }

    if (
      !(TokenNFT(collection).hasRole(TokenNFT(collection).BURNER_ROLE(), address(this)) &&
        TokenNFT(collection).hasRole(TokenNFT(collection).PAUSER_ROLE(), address(this)))
    ) {
      revert CollectionNotProvideEnoughRights();
    }

    currentCollections.push(TokenNFT(collection));
    _unavailableTokenCount += _burnedTokenCountByContract[collection];
  }

  function removeCollection(address collection) external onlyState(State.Active) {
    if (!_currentCollections[collection]) {
      revert CollectionNotExist();
    }
    if (_burnedTokenCountByContract[collection] > 0) {
      revert CollectionAlreadyUsed();
    }
    for (uint i; i < currentCollections.length; i += 1) {
      if (address(currentCollections[i]) == collection) {
        currentCollections[i] = currentCollections[currentCollections.length - 1];
        break;
      }
    }
    currentCollections.pop();
  }

  function burnToken(address collection, uint tokenId) external onlyState(State.Active) {
    if (!_currentCollections[collection]) {
      revert CollectionNotExist();
    }
    TokenNFT(collection).burn(tokenId);
    if (_winnerRewards[msg.sender] == 0) {
      winners.push(msg.sender);
    }
    _winnerRewards[msg.sender] += burnReward;
    emit Won_NFT_Number(drawNumber, WinnerLevel.Burn, collection, tokenId);
    _burnedTokenCountByContract[collection] += 1;
    _unavailableTokenCount += 1;
  }

  function lotteryDraw() external onlyRole(DEFAULT_ADMIN_ROLE) onlyState(State.Ready) {
    uint bigRandom;
    uint random;
    (uint256 totalTickets, uint[] memory collectionsIndexBound) = _getCollectionsLength();
    uint256 freeTickets = totalTickets;

    for (uint8 level; level < 4; level += 1) {
      uint winnerCount;

      emit Lottery_Draw_Started(drawNumber, _loterryLevel[level].name);
      if (_loterryLevel[level].divider == 0) {
        winnerCount = 1;
      } else {
        winnerCount = totalTickets / _loterryLevel[level].divider;
        if (winnerCount == 0) {
          winnerCount = 1;
        }
      }
      address winnerCol;
      uint winnerId;
      address winnerAddr;

      for (uint i; i < winnerCount; i += 1) {
        do {
          do {
            (random, bigRandom) = _getRandom(freeTickets, bigRandom);
            //Get collection and position
            (winnerCol, winnerId) = _getNFT(collectionsIndexBound, random);
          } while (_allreadyUsedNFT(winnerCol, winnerId));
          (bool ok, bytes memory result) = address(winnerCol).call(
            abi.encodeWithSignature("ownerOf(uint256)", winnerId)
          );
          if (ok) {
            winnerAddr = abi.decode(result, (address));
            break;
          }
        } while (true);

        if (_winnerRewards[winnerAddr] == 0) {
          winners.push(winnerAddr);
        }
        _winnerRewards[winnerAddr] += _loterryLevel[level].amount;
        emit Won_NFT_Number(drawNumber, _loterryLevel[level].name, winnerCol, winnerId);
        _unavailableTokens[winnerCol][winnerId] = true;
        _unavailableTokenCount += 1;
        freeTickets -= 1;
      }
      emit Lottery_Draw_Finished(drawNumber, _loterryLevel[level].name);
    }
    _state = State.DrawOver;
    emit New_Lottery_State(_state);
    _pause(false);
  }

  function payRewards() external onlyRole(DEFAULT_ADMIN_ROLE) onlyState(State.DrawOver) {
    for (uint i; i < winners.length; i += 1) {
      if (_winnerRewards[winners[i]] == 0) {
        continue;
      }
      //   transfer here
      _tokenReward.transfer(winners[i], _winnerRewards[winners[i]]);
      emit TransferReward(drawNumber, winners[i], _winnerRewards[winners[i]]);
      delete _winnerRewards[winners[i]];
    }
    delete winners;

    _state = State.Closed;
    emit New_Lottery_State(_state);
  }

  function cleanCurrentDraw() external onlyRole(DEFAULT_ADMIN_ROLE) onlyState(State.Closed) {
    for (uint i; i < currentCollections.length; i += 1) {
      _participatedCollections[address(currentCollections[i])] = true;
      uint nftCount = currentCollections[i].totalSupply() + _burnedTokenCountByContract[address(currentCollections[i])];
      for (uint item; item < nftCount; item += 1) {
        if (_unavailableTokens[address(currentCollections[i])][item]) {
          delete _unavailableTokens[address(currentCollections[i])][item];
        }
      }
      delete _currentCollections[address(currentCollections[i])];
      delete _burnedTokenCountByContract[address(currentCollections[i])];
    }
    _unavailableTokenCount = 0;
    delete currentCollections;
    _state = State.NotActive;
    emit New_Lottery_State(_state);
  }

  receive() external payable {}

  function withdraw() external onlyRole(DEFAULT_ADMIN_ROLE) {
    payable(msg.sender).transfer(address(msg.sender).balance);
  }

  function _getCollectionsLength() internal view returns (uint, uint[] memory) {
    uint256 total;
    uint[] memory array = new uint[](currentCollections.length);
    for (uint8 i; i < currentCollections.length; i += 1) {
      array[i] = TokenNFT(currentCollections[i]).totalSupply();
      total += array[i];
      array[i] += _burnedTokenCountByContract[address(currentCollections[i])];
    }
    return (total, array);
  }
  function _getRandom(uint count, uint big) private view returns (uint, uint) {
    if (big == 0) {
      big = _random(count);
    }
    uint random = big % count;
    big /= count;
    return (random, big);
  }

  function _random(uint module) private view returns (uint) {
    return uint(keccak256(abi.encodePacked(block.timestamp, msg.sender, module)));
  }

  function _getNFT(uint[] memory collectionIndexBound, uint number) private view returns (address, uint) {
    uint index;
    while (number > collectionIndexBound[index] - 1) {
      number -= collectionIndexBound[index];
      index += 1;
    }
    return (address(currentCollections[index]), number);
  }

  function _allreadyUsedNFT(address addr, uint number) private view returns (bool) {
    return _unavailableTokens[addr][number];
  }

  function _pause(bool stop) internal {
    for (uint i; i < currentCollections.length; i += 1) {
      if (stop) {
        currentCollections[i].pause();
      } else {
        currentCollections[i].unpause();
      }
    }
  }
}
