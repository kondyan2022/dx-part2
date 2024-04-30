// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";

contract TokenNFT is ERC721, ERC721Enumerable, ERC721Pausable, AccessControl, ERC721Burnable {
  bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
  bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  //   bytes32 public constant BURNER_ROLE = keccak256("BURNER_ROLE");
  uint256 private _nextTokenId;

  constructor(
    string memory tokenName,
    string memory tokenSymbol,
    address defaultAdmin,
    address pauser,
    address burner,
    address minter
  ) ERC721(tokenName, tokenSymbol) {
    _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
    _grantRole(PAUSER_ROLE, pauser);
    _grantRole(MINTER_ROLE, minter);
    _grantRole(BURNER_ROLE, burner);
  }

  function pause() public onlyRole(PAUSER_ROLE) {
    _pause();
  }

  function unpause() public onlyRole(PAUSER_ROLE) {
    _unpause();
  }

  function safeMint(address to) public onlyRole(MINTER_ROLE) {
    uint256 tokenId = _nextTokenId++;
    _safeMint(to, tokenId);
  }

  function burn(uint256 tokenId) public override onlyRole(BURNER_ROLE) {
    super.burn(tokenId);
  }

  // The following functions are overrides required by Solidity.

  function _update(
    address to,
    uint256 tokenId,
    address auth
  ) internal override(ERC721, ERC721Enumerable, ERC721Pausable) returns (address) {
    return super._update(to, tokenId, auth);
  }

  function _increaseBalance(address account, uint128 value) internal override(ERC721, ERC721Enumerable) {
    super._increaseBalance(account, value);
  }

  function supportsInterface(
    bytes4 interfaceId
  ) public view override(ERC721, ERC721Enumerable, AccessControl) returns (bool) {
    return super.supportsInterface(interfaceId);
  }
}
