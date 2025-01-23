const trackTransaction = async (txData) => {
  await fetch('/api/analytics', {
    method: 'POST',
    body: JSON.stringify({
      type: 'transaction',
      network: txData.network,
      amount: txData.amount,
      timestamp: Date.now(),
      status: txData.status,
      currency: txData.currency
    })
  });
};