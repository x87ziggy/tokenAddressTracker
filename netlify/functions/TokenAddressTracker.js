import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import 'dotenv/config';
import { createClient } from 'redis';
import { Telegraf } from 'telegraf';

const { redisPass, redisUrl, redisPort, BOT_TOKEN, BOT_CHANNEL_ID } = process.env;

const walletAddress = 'FDk64ha2MskfH2GLousxoyAATXQxLLk5JKbtWiDYepNM';

async function redisConnect() {
  // redis
  const client = createClient({
    password: redisPass,
    socket: {
      host: redisUrl,
      port: redisPort,
    },
  });
  client.on('error', (err) => console.log('Redis Client Error', err));

  await client.connect();
  return client;
}

const bot = new Telegraf(BOT_TOKEN);

export default async function getTokenAccountsByOwner() {
  const redisClient = await redisConnect();
  const connection = new Connection(clusterApiUrl('mainnet-beta'));
  const tokenProgramId = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');

  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(walletAddress), { programId: tokenProgramId });

    for (let account of accounts.value) {
      const accountInfo = account.account.data.parsed.info;
      const balance = accountInfo.tokenAmount.uiAmount;
      const tokenId = accountInfo.mint;

      // Check if this account was previously notified and its balance
      const prevBalance = await redisClient.get(tokenId);

      const message = `Token ${tokenId} has a balance of ${balance}.`;
      console.log(message);
      if (balance > 0 && (!prevBalance || parseFloat(prevBalance) !== balance)) {
        // Notify via Telegram
        await bot.telegram.sendMessage(BOT_CHANNEL_ID, message);

        // Update Redis with the new balance
        await redisClient.set(tokenId, balance.toString());
      }
    }
  } catch (error) {
    console.error('Error fetching token accounts:', error);
  }
  await redisClient.quit();
  return new Response('Ok');
}
