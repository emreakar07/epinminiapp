import React, { useState, useEffect } from 'react';
import { WebApp } from '@twa-dev/sdk';
import { TonConnectButton } from '@tonconnect/ui-react';
import { TonConnectUIProvider, useTonConnectUI } from '@tonconnect/ui-react';
import { beginCell, toNano, Address } from '@ton/core';
import Web3 from 'web3';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { ethers } from 'ethers';
import QRCode from 'qrcode.react';
import './styles.css';
import { ERC20_ABI } from './constants/abi';

// Desteklenen blockchain'ler ve özellikleri
const SUPPORTED_NETWORKS = {
  TON: {
    name: 'TON',
    currencies: {
      TON: {
        decimals: 9,
        symbol: 'TON'
      },
      USDT: {
        decimals: 6,
        symbol: 'USDT',
        address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs'
      }
    },
    explorer: 'https://tonscan.org/tx/'
  },
  ETH: {
    name: 'Ethereum',
    currencies: {
      ETH: {
        decimals: 18,
        symbol: 'ETH'
      },
      USDT: {
        decimals: 6,
        symbol: 'USDT',
        address: '0xdac17f958d2ee523a2206206994597c13d831ec7'
      }
    },
    rpcUrl: `https://mainnet.infura.io/v3/${process.env.REACT_APP_INFURA_ID}`,
    explorer: 'https://etherscan.io/tx/'
  },
  BSC: {
    name: 'BNB Smart Chain',
    currencies: {
      BNB: {
        decimals: 18,
        symbol: 'BNB'
      },
      USDT: {
        decimals: 18,
        symbol: 'USDT',
        address: '0x55d398326f99059ff775485246999027b3197955'
      }
    },
    rpcUrl: 'https://bsc-dataseed.binance.org',
    explorer: 'https://bscscan.com/tx/'
  },
  SOLANA: {
    name: 'Solana',
    currencies: {
      SOL: {
        decimals: 9,
        symbol: 'SOL'
      },
      USDT: {
        decimals: 6,
        symbol: 'USDT',
        address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'
      }
    },
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    explorer: 'https://solscan.io/tx/'
  }
};

const SUPPORTED_WALLETS = {
  TON: ['TonKeeper', 'TonHub', 'OpenMask'],
  ETH: ['MetaMask', 'WalletConnect', 'Coinbase'],
  BSC: ['MetaMask', 'TrustWallet', 'Binance'],
  SOLANA: ['Phantom', 'Solflare', 'Slope']
};

function App() {
  const [tonConnectUI] = useTonConnectUI();
  const [paymentData, setPaymentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [txStatus, setTxStatus] = useState('');
  const [txHash, setTxHash] = useState('');
  const [providers, setProviders] = useState({});

  useEffect(() => {
    try {
      if (!WebApp.isInitialized) {
        throw new Error('Telegram WebApp başlatılamadı');
      }

      WebApp.ready();
      WebApp.expand();
      WebApp.MainButton.hide();
      WebApp.BackButton.show();
      WebApp.BackButton.onClick(() => WebApp.close());

      const urlParams = new URLSearchParams(window.location.search);
      const requiredParams = ['amount', 'paymentMethod', 'blockchain', 'walletAddress'];
      
      const missingParams = requiredParams.filter(param => !urlParams.get(param));
      if (missingParams.length > 0) {
        throw new Error(`Eksik parametreler: ${missingParams.join(', ')}`);
      }

      const amount = parseFloat(urlParams.get('amount'));
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Geçersiz ödeme tutarı');
      }

      setPaymentData({
        amount,
        paymentMethod: urlParams.get('paymentMethod'),
        blockchain: urlParams.get('blockchain'),
        walletAddress: urlParams.get('walletAddress')
      });

    } catch (err) {
      setError({
        title: 'Hata',
        message: err.message
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    initializeProviders();
  }, [paymentData]);

  const initializeProviders = async () => {
    const newProviders = {};

    if (paymentData?.blockchain === 'ETH' || paymentData?.blockchain === 'BSC') {
      const rpcUrl = SUPPORTED_NETWORKS[paymentData.blockchain].rpcUrl;
      const web3 = new Web3(new Web3.providers.HttpProvider(rpcUrl));
      newProviders.web3 = web3;
    }

    if (paymentData?.blockchain === 'SOLANA') {
      const connection = new Connection(SUPPORTED_NETWORKS.SOLANA.rpcUrl);
      newProviders.solana = connection;
    }

    setProviders(newProviders);
  };

  const monitorTransaction = async (hash) => {
    try {
      const tx = await tonConnectUI.wallet.client.getTransaction(hash);
      if (tx.status === 'confirmed') {
        setTxStatus('success');
        WebApp.showPopup({
          title: 'Başarılı',
          message: 'Ödeme başarıyla tamamlandı!',
          buttons: [{
            type: 'ok'
          }]
        });
      }
    } catch (err) {
      setTxStatus('failed');
      setError({
        title: 'İşlem Hatası',
        message: 'Ödeme işlemi başarısız oldu.'
      });
    }
  };

  const handlePayment = async () => {
    try {
      setLoading(true);
      
      if (!tonConnectUI.connected) {
        throw new Error('Cüzdan bağlı değil');
      }

      let tx;
      switch (paymentData.blockchain) {
        case 'TON':
          tx = await handleTonPayment();
          break;
        case 'ETH':
        case 'BSC':
          tx = await handleEVMPayment();
          break;
        case 'SOLANA':
          tx = await handleSolanaPayment();
          break;
        default:
          throw new Error('Desteklenmeyen blockchain');
      }

      setTxHash(tx.hash);
      await monitorTransaction(tx.hash);
      
    } catch (err) {
      setError({
        title: 'Ödeme Hatası',
        message: err.message
      });
      WebApp.showPopup({
        title: 'Hata',
        message: err.message,
        buttons: [{
          type: 'ok'
        }]
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTonPayment = async () => {
    if (!tonConnectUI.connected || !tonConnectUI.wallet) {
      throw new Error('TON wallet not connected');
    }

    const amount = toNano(paymentData.amount.toString());
    
    return await tonConnectUI.wallet.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: paymentData.walletAddress,
          amount: amount
        }
      ]
    });
  };

  const handleEVMPayment = async () => {
    const web3 = providers.web3;
    const networkData = SUPPORTED_NETWORKS[paymentData.blockchain];
    
    if (paymentData.paymentMethod === networkData.currencies.USDT.symbol) {
      const tokenContract = new web3.eth.Contract(
        ERC20_ABI,
        networkData.currencies.USDT.address
      );

      const decimals = networkData.currencies.USDT.decimals;
      const amount = ethers.utils.parseUnits(
        paymentData.amount.toString(),
        decimals
      );

      return await tokenContract.methods
        .transfer(paymentData.walletAddress, amount)
        .send({ from: tonConnectUI.wallet.address });
    } else {
      return await web3.eth.sendTransaction({
        from: tonConnectUI.wallet.address,
        to: paymentData.walletAddress,
        value: web3.utils.toWei(paymentData.amount.toString(), 'ether')
      });
    }
  };

  const handleSolanaPayment = async () => {
    const connection = providers.solana;
    
    if (paymentData.paymentMethod === 'USDT') {
      // SPL Token transferi
      const tokenMint = new PublicKey(SUPPORTED_NETWORKS.SOLANA.currencies.USDT.address);
      const destinationAccount = new PublicKey(paymentData.walletAddress);
      
      const transaction = new Transaction().add(
        Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          tonConnectUI.wallet.publicKey,
          destinationAccount,
          tonConnectUI.wallet.publicKey,
          [],
          paymentData.amount * (10 ** SUPPORTED_NETWORKS.SOLANA.currencies.USDT.decimals)
        )
      );

      return await tonConnectUI.wallet.signAndSendTransaction(transaction);
    } else {
      // SOL transferi
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: tonConnectUI.wallet.publicKey,
          toPubkey: new PublicKey(paymentData.walletAddress),
          lamports: paymentData.amount * LAMPORTS_PER_SOL
        })
      );

      return await tonConnectUI.wallet.signAndSendTransaction(transaction);
    }
  };

  const generatePaymentUri = () => {
    if (!paymentData) return '';
    
    const networkData = SUPPORTED_NETWORKS[paymentData.blockchain];
    const params = new URLSearchParams();

    switch (paymentData.blockchain) {
      case 'TON':
        params.set('address', paymentData.walletAddress);
        params.set('amount', toNano(paymentData.amount.toString()).toString());
        params.set('text', 'Payment');
        return `ton://transfer/${paymentData.walletAddress}?${params.toString()}`;
        
      case 'ETH':
      case 'BSC':
        if (paymentData.paymentMethod === 'USDT') {
          return `${paymentData.blockchain.toLowerCase()}:${networkData.currencies.USDT.address}/transfer?address=${paymentData.walletAddress}&uint256=${paymentData.amount * (10 ** networkData.currencies.USDT.decimals)}`;
        }
        return `${paymentData.blockchain.toLowerCase()}:${paymentData.walletAddress}?value=${paymentData.amount * (10 ** 18)}`;
        
      case 'SOLANA':
        return `solana:${paymentData.walletAddress}?amount=${paymentData.amount}&label=Payment`;
        
      default:
        return '';
    }
  };

  const connectWallet = async (walletName) => {
    // Cüzdan bağlantı mantığı...
  };

  const fetchTransactionHistory = async () => {
    if (!tonConnectUI.connected || !tonConnectUI.wallet) return;
    
    const networkData = SUPPORTED_NETWORKS[paymentData.blockchain];
    const response = await fetch(`${networkData.apiUrl}/address/${tonConnectUI.wallet.address}/transactions`);
    const history = await response.json();
    
    setTransactionHistory(history.map(tx => ({
      hash: tx.hash,
      amount: tx.value,
      timestamp: tx.timestamp,
      status: tx.status,
      from: tx.from,
      to: tx.to
    })));
  };

  const fetchPrices = async () => {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=the-open-network,ethereum,binancecoin,tron,solana&vs_currencies=usd');
    const data = await response.json();
    setPrices(data);
  };

  // Fiyat gösterimi komponenti
  const PriceDisplay = () => (
    <div className="price-feed">
      {Object.entries(prices).map(([coin, price]) => (
        <div key={coin} className="price-item">
          <img src={`/images/${coin}.png`} alt={coin} />
          <span>${price.usd}</span>
        </div>
      ))}
    </div>
  );

  const validateTransaction = async () => {
    // Adres formatı kontrolü
    if (!isValidAddress(paymentData.walletAddress, paymentData.blockchain)) {
      throw new Error('Geçersiz cüzdan adresi');
    }

    // Bakiye kontrolü
    const balance = await getBalance();
    if (balance < paymentData.amount) {
      throw new Error('Yetersiz bakiye');
    }

    // Spam/scam kontrolü
    const isScam = await checkScamDatabase(paymentData.walletAddress);
    if (isScam) {
      throw new Error('Güvenlik uyarısı: Şüpheli adres');
    }
  };

  const handleBatchTransfer = async (recipients) => {
    const transactions = recipients.map(recipient => ({
      to: recipient.address,
      amount: recipient.amount,
      token: recipient.token
    }));

    const batchTx = await tonConnectUI.wallet.sendBatchTransaction(transactions);
    return batchTx;
  };

  if (loading) {
    return (
      <div className="loading-spinner">
        <div className="spinner"></div>
        <p>Yükleniyor...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="error-message">
        <h2>{error.title}</h2>
        <p>{error.message}</p>
      </div>
    );
  }

  return (
    <div className="payment-container">
      <TonConnectButton />
      
      {tonConnectUI.connected && paymentData && (
        <>
          <div className="payment-details">
            <h2>Ödeme Detayları</h2>
            <p>Tutar: {paymentData.amount} {paymentData.paymentMethod}</p>
            <p>Blockchain: {paymentData.blockchain}</p>
            <p className="wallet-address">
              Alıcı Adresi: 
              <span className="address-text">{paymentData.walletAddress}</span>
            </p>
            {txHash && (
              <p>İşlem Durumu: {txStatus === 'success' ? '✅ Başarılı' : txStatus === 'failed' ? '❌ Başarısız' : '⏳ İşleniyor'}</p>
            )}
          </div>
          
          <div className="qr-container">
            <QRCode 
              value={generatePaymentUri()} 
              size={256}
              level="H"
              includeMargin={true}
              fgColor={WebApp.themeParams.text_color}
              bgColor={WebApp.themeParams.bg_color}
              renderAs="svg"
            />
          </div>
          
          <button 
            className="payment-button"
            onClick={handlePayment}
            style={{
              backgroundColor: WebApp.themeParams.button_color,
              color: WebApp.themeParams.button_text_color
            }}
          >
            {txStatus === 'success' ? 'Ödeme Tamamlandı' : 'Ödemeye Geç'}
          </button>
        </>
      )}
    </div>
  );
}

export default function AppWithProvider() {
  return (
    <TonConnectUIProvider manifestUrl="https://your-manifest-url.json">
      <App />
    </TonConnectUIProvider>
  );
}