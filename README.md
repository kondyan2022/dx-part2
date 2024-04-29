# Solar green test project (Dexola Solidity Bootcamp Part 2)

## How to Run

1. Clone the repository to your computer.
2. Install dependencies using the `npm install` command.
3. Compile the project with the `npm run compile` command.

## Try running some of the following tasks:

- Compile the project

```shell
npm run compile
```

- Test the project using Hardhat

```shell
npm run test
```

- Test the project with coverage using Hardhat

```shell
npm run coverage
```

## Files

- [`Lottery.sol`](./contracts/Lottery.sol) &mdash; lottery contract
- [`SolarGreenSale.sol`](./contracts/TokenNFT.sol) &mdash; ERC721 contract.
- [`USDTTestToken.sol`](./contracts/USDTTestToken.sol) &mdash; emulate [test USDT contract ](https://sepolia.etherscan.io/address/0x1531bc5de10618c511349f8007c08966e45ce8ef#writeContract) for hardhat tests

## Test coverage

| File          |   % Stmts |  % Branch |   % Funcs |   % Lines |
| ------------- | --------: | --------: | --------: | --------: |
| contracts\    |     97.78 |     83.33 |     93.33 |     98.73 |
| Lottery.sol   |       100 |     85.71 |       100 |       100 |
| TokenNFT.sol  |     83.33 |      62.5 |        75 |     83.33 |
| **All files** | **97.78** | **83.33** | **93.33** | **98.73** |

## Deployment to the Sepolia Testnet

[`Lottery.sol`](https://sepolia.etherscan.io/address/0x26c31102e1c8856a112a85b16578d7b0700ce196)

[`TokenNFT.sol#1`](https://sepolia.etherscan.io/address/0x26c31102e1c8856a112a85b16578d7b0700ce196)
[`TokenNFT.sol#2`](https://sepolia.etherscan.io/address/0x26c31102e1c8856a112a85b16578d7b0700ce196)
[`TokenNFT.sol#3`](https://sepolia.etherscan.io/address/0x26c31102e1c8856a112a85b16578d7b0700ce196)

## UA

## Як використовувати контракт Lottery?

Контракт містить публічну змінну **state**, котра зберігає поточний стан контракту лотереї.
Можуть бути наступні стани: **NotActive**, **Active**, **Ready**,**DrawOver**, **Closed**.
В процесі проведення, перехід між станами відбуваеться послідовно в порядку, що надано вище.
Зі стану **Closed** перехід відбувається у **NotActive**.

Проведення розіграшу:

1. Після розміщння, контракт має стан **NotActive**. Доступна можливість заміни контракту токену ERC20 для виплати винагород.
2. Функція **startLottery** переводить в стан **Active**. Доступно додавання та видалення коллекцій NFT у розіграш. Контракт NFT, що додається, повинен надати виключні права контракту лотереї на спалення токенів та припинення операцій. На цьому етапі, учасник може спалити свій NFT та одразу отримати винагороду. Контракт повинен мати на балансі токени для виплати.
3. Функція **readyLottery** переводить в стан **Ready**. Будь які операції з токенами NFT призупиняються. Єдина можлива подальша дія - розіграш. Можливо отримати інформацію щодо розміру призового фонду.
4. Функція **lotteryDraw** проводить розіграж лотетереї генеруючи події з даними виграшних NFT та зберігає в контракті список власників NFT з призовими сумами щодо поточного розіграшу. Лотерея переводиться в стан **DrawOver**.
5. Функція **payRewards** проводить виплату призових сум для поточного розіграшу. Лотерея переводиться в стан **Closed**. Контракт повинен мати на балансі токени для виплати.
6. Функція **cleanCurrentDraw** очищує змінні контракту та повертає початковий стан. Лотерея переводиться в стан **NotActive**.

Таблиця доступності функцій в залежності від стану

| Function                | NotActive | Active | Ready  | DrawOver | Closed | Admin only |
| ----------------------- | :-------: | :----: | :----: | :------: | :----: | :--------: |
| setRewardToken          |  **\+**   |        |        |          |        |   **\+**   |
| getWinnerPayoutList     |  **\+**   | **\+** | **\+** |  **\+**  | **\+** |            |
| getPrizeFundVolume      |  **\+**   | **\+** | **\+** |  **\+**  | **\+** |            |
| startLottery **\***     |  **\+**   |        |        |          |        |   **\+**   |
| addCollection           |           | **\+** |        |          |        |   **\+**   |
| removeCollection        |           | **\+** |        |          |        |   **\+**   |
| burnToken               |           | **\+** |        |          |        |            |
| readyLottery **\***     |           | **\+** |        |          |        |   **\+**   |
| lotteryDraw **\***      |           |        | **\+** |          |        |   **\+**   |
| payRewards **\***       |           |        |        |  **\+**  |        |   **\+**   |
| cleanCurrentDraw **\*** |           |        |        |          | **\+** |   **\+**   |
| withdrawRewardTokens    |  **\+**   | **\+** | **\+** |  **\+**  | **\+** |   **\+**   |

**\*** - функція змінює **state** на наступний
