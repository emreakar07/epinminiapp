const notifyWebhook = async (txData) => {
  await fetch(paymentData.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      transactionHash: txData.hash,
      status: txData.status,
      amount: txData.amount,
      currency: txData.currency,
      timestamp: Date.now()
    })
  });
}; 