import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import 'dotenv/config';
import { createClient } from 'redis';
import { Telegraf } from 'telegraf';

const { redisPass, redisUrl, redisPort, BOT_TOKEN, BOT_CHANNEL_ID, walletAddresses } = process.env;

async function redisConnect() {
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

  // Split the walletAddresses string into an array of addresses
  const wallets = walletAddresses.split(',');

  for (let walletAddress of wallets) {
    try {
      const accounts = await connection.getParsedTokenAccountsByOwner(new PublicKey(walletAddress.trim()), { programId: tokenProgramId });

      for (let account of accounts.value) {
        const accountInfo = account.account.data.parsed.info;
        const tokenId = accountInfo.mint;

        // Check if a notification for this token was previously sent
        const notified = await redisClient.get(tokenId);

        if (!notified) {
          const message = `Token ${tokenId} is present in one of your wallets.`;
          console.log(message);
          // Notify via Telegram
          await bot.telegram.sendMessage(BOT_CHANNEL_ID, message);

          // Mark this token as notified in Redis
          await redisClient.set(tokenId, 'true');
        }
      }
    } catch (error) {
      console.error('Error fetching token accounts for wallet ' + walletAddress + ':', error);
    }
  }
  await redisClient.quit();
  return new Response('Ok');
}
