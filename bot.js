require('dotenv').config();
const express = require('express');
const { TwitterApi } = require('twitter-api-v2');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 4000;
const POLLING_INTERVAL = 2 * 60 * 1000;

const twitterClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

const chatIds = new Set();
let lastTweetId = '1858133427062706588';

async function pollTweets() {
    try {
        const { data: tweets } = await twitterClient.v2.userTimeline(process.env.ID, {
            'tweet.fields': ['id', 'text', 'created_at'],
            max_results: 5,
            since_id: lastTweetId,
        });
        if (tweets.data.length > 0) {
            tweets.data.reverse().forEach(tweet => {
                forwardTweet(tweet);
                lastTweetId = tweet.id;
            });
        }
    } catch (error) {
        console.error('Error fetching tweets:', error);
    }
}

async function forwardTweet(tweet) {
    const tweetUrl = `https://twitter.com/${process.env.TWITTER_USERNAME}/status/${tweet.id}`;
    const tweetDate = new Date(tweet.created_at).toLocaleString();

    const message = `<b>New tweet from @${process.env.TWITTER_USERNAME}</b>:\n\n${tweet.text}\n\n📅 <i>${tweetDate}</i>`;

    const options = {
        parse_mode: 'HTML',
        reply_markup: {
            inline_keyboard: [
                [
                    {
                        text: "🔗 View Tweet",
                        url: tweetUrl,
                    },
                ],
            ],
        },
        disable_web_page_preview: true,
    };

    for (const chatId of chatIds) {
        try {
            await bot.sendMessage(chatId, message, options);
            console.log(`Forwarded tweet to chatId ${chatId}`);
        } catch (error) {
            console.error(`Error sending message to chatId ${chatId}:`, error);
        }
    }
}


bot.onText(/\/start/, msg => {
    const chatId = msg.chat.id;

    if (!chatIds.has(chatId)) {
        chatIds.add(chatId);
        bot.sendMessage(chatId, 'You have been added to the tweet notification list!');
        console.log(`Added chatId ${chatId} to notification list.`);
    } else {
        bot.sendMessage(chatId, 'You are already on the tweet notification list.');
    }
});

bot.onText(/\/stop/, msg => {
    const chatId = msg.chat.id;

    if (chatIds.has(chatId)) {
        chatIds.delete(chatId);
        bot.sendMessage(chatId, 'You have been removed from the tweet notification list.');
        console.log(`Removed chatId ${chatId} from notification list.`);
    } else {
        bot.sendMessage(chatId, 'You are not on the tweet notification list.');
    }
});

setInterval(pollTweets, POLLING_INTERVAL);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
