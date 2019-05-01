import { expect } from 'chai';
import { mock, instance, when } from 'ts-mockito';
import { Networks, OutputType } from 'boltz-core';
import { TransactionBuilder, ECPair } from 'bitcoinjs-lib';
import Logger from '../../../lib/Logger';
import { generateAddress } from '../../Utils';
import SwapNursery from '../../../lib/swap/SwapNursery';
import ChainClient from '../../../lib/chain/ChainClient';
import WalletManager from '../../../lib/wallet/WalletManager';

describe('SwapNursery', () => {
  const constructTransaction = (rbf: boolean, input: string) => {
    const { outputScript } = generateAddress(OutputType.Bech32);
    const keys = ECPair.makeRandom({ network: Networks.bitcoinRegtest });

    const builder = new TransactionBuilder(Networks.bitcoinRegtest);

    builder.addInput(input, 0, rbf ? 0xffffffff - 2 : 0xffffffff);
    builder.addOutput(outputScript, 1);

    builder.sign(0, keys);

    return builder.build();
  };

  const emptyRawTransaction = {
    txid: '',
    hash: '',
    version: 0,
    size: 0,
    vsize: 0,
    weight: 0,
    locktime: 0,
    vin: [],
    vout: [],
    hex: '',
    time: 0,
    blocktime: 0,
  };

  const explicitTxInput = '1eeeb0b4295d536ca4a85e0e47a3fca73f53929b8fd65b816de5a48748c0351d';
  const inheritedTxInput = 'd3db4612fd44c6effe0b6bcd115a26a525d4e6502b31308ea3d7f4512eaea585';

  const chainClientMock = mock(ChainClient);
  when(chainClientMock.getRawTransaction(explicitTxInput, true)).thenResolve({
    ...emptyRawTransaction,

    confirmations: 1,
  });
  when(chainClientMock.getRawTransaction(inheritedTxInput, true)).thenResolve({
    ...emptyRawTransaction,

    confirmations: 0,
    hex: constructTransaction(true, inheritedTxInput).toHex(),
  });

  const chainClient = instance(chainClientMock);

  const walletManagerMock = mock(WalletManager);
  const walletManager = instance(walletManagerMock);

  const swapNursery = new SwapNursery(Logger.disabledLogger, walletManager);
  const transactionSignalsRbf = swapNursery['transactionSignalsRbf'];

  it('should detect explicit RBF signalling', async () => {
    let isRbf = await transactionSignalsRbf(chainClient, constructTransaction(true, explicitTxInput));
    expect(isRbf).to.be.true;

    isRbf = await transactionSignalsRbf(chainClient, constructTransaction(false, explicitTxInput));
    expect(isRbf).to.be.false;
  });

  it('should detect inherited RBF signalling', async () => {
    const isRbf = await transactionSignalsRbf(chainClient, constructTransaction(false, inheritedTxInput));
    expect(isRbf).to.be.true;
  });
});
