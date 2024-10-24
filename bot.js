require('dotenv').config();
const express = require('express');
const { TwitterApi } = require('twitter-api-v2');
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');

const app = express();
app.use(express.json())
const PORT = 3000;
const twitterClient = new TwitterApi({
    appKey: "XhyEJFXfVCXQnBiHPZN3aEmOn",
    appSecret: "ucyN1tqyu6mDLRBDdGufp50R4cIjWqhCnnxXru13K1JhqRlbdi",
    accessToken: "1794758198743781376-Pvy5djKmDMHtfPxNvTd6a5I4bUdzDz",
    accessSecret: "qL8056yWsdhFK7GEL42j5qBBV0YEHLIJtbw5MhmNvFrMA",
});

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

const chatId = process.env.TELEGRAM_CHAT_ID;
const chatIds = new Set();

async function forwardTweets(chatId, username, tweetCount = 5) {
    try {
        const user = await twitterClient.v2.userByUsername(username);

        const tweets = await twitterClient.v2.userTimeline(user.data.id, {
            max_results: tweetCount,
            expansions: ['attachments.media_keys'],
            'tweet.fields': ['created_at', 'text'],
            'media.fields': ['url', 'type']
        });

        if (!tweets.data || !Array.isArray(tweets.data)) {
            throw new Error('No tweets found or data format is incorrect.');
        }

        for (const tweet of tweets.data) {
            const message = `New tweet from @${username}:\n\n${tweet.text}\n`;

            await bot.sendMessage(chatId, message);

            const mediaAttachments = tweets.includes?.media;
            if (mediaAttachments && Array.isArray(mediaAttachments) && mediaAttachments.length > 0) {
                for (const media of mediaAttachments) {
                    if (media.type === 'photo') {
                        await bot.sendPhoto(chatId, media.url);
                    } else if (media.type === 'video') {
                        await bot.sendVideo(chatId, media.url);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error fetching tweets:', error.message);
        bot.sendMessage(chatId, `Error fetching tweets from @${username}: ${error.message}`);
    }
}

bot.on('message', (msg) => {
    const chatId = msg.chat.id;

    if (msg.chat.type === 'group' || msg.chat.type === 'supergroup') {
        const groupId = msg.chat.id;

        bot.sendMessage(groupId, 'I am now watching tweets!');

        const twitterUsername = process.env.TWITTER_USERNAME;
        forwardTweets(groupId, twitterUsername, 5);
    }

    if (!chatIds.has(chatId)) {
        chatIds.add(chatId);
        bot.sendMessage(chatId, 'You have been added to the tweet notification list!');
    } else {
        bot.sendMessage(chatId, 'You are already on the tweet notification list.');
    }
});
let lastTweetId = null;

async function forwardMyTweets(tweetCount = 5) {
    try {
        const user = await twitterClient.v2.me();

        const params = {
            max_results: tweetCount,
        };

        if (lastTweetId) {
            params.since_id = lastTweetId;
        }

        const tweetsPaginator = await twitterClient.v2.userTimeline(user.data.id, params);

        const tweets = tweetsPaginator._realData?.data;

        if (!tweets || !Array.isArray(tweets) || tweets.length === 0) {
            throw new Error('No new tweets found.');
        }

        lastTweetId = tweets[0].id;



        for (const tweet of tweets) {
            const message = `New tweet from @${user.data.username}:\n\n${tweet.text}\n\nPosted at: ${tweet.created_at}`;

            for (const chatId of chatIds) {
                await bot.sendMessage(chatId, message);

                const mediaAttachments = tweetsPaginator.includes?.media;
                if (mediaAttachments && Array.isArray(mediaAttachments) && mediaAttachments.length > 0) {
                    for (const media of mediaAttachments) {
                        if (media.type === 'photo') {
                            await bot.sendPhoto(chatId, media.url);
                        } else if (media.type === 'video') {
                            await bot.sendVideo(chatId, media.url);
                        }
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error fetching tweets:', error.message);
        for (const chatId of chatIds) {
            bot.sendMessage(chatId, `Error fetching tweets: ${error.message}`);
        }
    }
}

cron.schedule('*/5 * * * *', () => {
    forwardMyTweets(10);
    console.log('Forwarding tweets to all registered chat IDs...');
});

bot.onText(/\/forward (.+)/, (msg, match) => {
    const username = match[1];
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `Fetching and forwarding tweets from @${username}...`);
    forwardTweets(chatId, username);
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
