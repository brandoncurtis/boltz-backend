import { EventEmitter } from 'events';
import { Transaction, TxOutput } from 'bitcoinjs-lib';
import { getHexString } from '../Utils';
import SwapManager from '../swap/SwapManager';
import { Currency } from '../wallet/WalletManager';

interface EventHandler {
  on(event: 'transaction', listener: (outputAddress: string, transactionHash: string, confirmed: boolean) => void): this;
  emit(event: 'transaction', outputAddress: string, transactionHash: string, confirmed: boolean): boolean;

  on(even: 'invoice.paid', listener: (invoice: string) => void): this;
  emit(event: 'invoice.paid', invoice: string): boolean;

  on(event: 'invoice.failedToPay', listener: (invoice: string) => void): this;
  emit(event: 'invoice.failedToPay', invoice: string): boolean;

  on(event: 'invoice.settled', listener: (invoice: string, preimage: string) => void): this;
  emit(event: 'invoice.settled', string: string, preimage: string): boolean;

  on(event: 'refund', listener: (lockupTransactionHash: string) => void): this;
  emit(event: 'refund', lockupTransactionHash: string): boolean;

  on(event: 'channel.backup', listener: (currency: string, channelBackup: string) => void): this;
  emit(event: 'channel.backup', currency: string, channelbackup: string): boolean;
}

class EventHandler extends EventEmitter {
  // A map between the hex strings of the scripts of the addresses and
  // the addresses themselves to which Boltz should listen
  public listenScripts = new Map<string, string>();

  constructor(private currencies: Map<string, Currency>, private swapManager: SwapManager) {
    super();

    this.subscribeTransactions();
    this.subscribeInvoices();
    this.subscribeRefunds();
    this.subscribeChannelBackups();
  }

  /**
   * Subscribes to a stream of transactions to addresses that were specified with "ListenOnAddress"
   */
  private subscribeTransactions = () => {
    this.currencies.forEach((currency) => {
      currency.chainClient.on('transaction', (transaction: Transaction, confirmed: boolean) => {
        transaction.outs.forEach((out: any) => {
          const output = out as TxOutput;
          const listenAddress = this.listenScripts.get(getHexString(output.script));

          if (listenAddress) {
            this.emit('transaction', listenAddress, transaction.getId(), confirmed);
          }
        });
      });
    });
  }

  /**
   * Subscribes to a stream of settled invoices and those paid by Boltz
   */
  private subscribeInvoices = () => {
    this.currencies.forEach((currency) => {
      currency.lndClient.on('invoice.paid', (invoice) => {
        this.emit('invoice.paid', invoice);
      });

      currency.lndClient.on('invoice.settled', (invoice, preimage) => {
        this.emit('invoice.settled', invoice, preimage);
      });
    });

    this.swapManager.nursery.on('invoice.failedToPay', (invoice) => {
      this.emit('invoice.failedToPay', invoice);
    });
  }

  /**
   * Subscribes to a stream of lockup transactions that Boltz refunds
   */
  private subscribeRefunds = () => {
    this.swapManager.nursery.on('refund', (lockupTransactionHash) => {
      this.emit('refund', lockupTransactionHash);
    });
  }

  /**
   * Subscribes to a a stream of channel backups
   */
  private subscribeChannelBackups = () => {
    this.currencies.forEach((currency) => {
      const { symbol, lndClient } = currency;

      lndClient.on('channel.backup', (channelBackup: string) => {
        this.emit('channel.backup', symbol, channelBackup);
      });
    });
  }
}

export default EventHandler;
