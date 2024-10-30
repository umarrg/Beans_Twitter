require('dotenv').config();
const express = require('express');
const { TwitterApi, ETwitterStreamEvent } = require('twitter-api-v2');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;


const twitterClient = new TwitterApi(process.env.TWITTER_BEARER_TOKEN);

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

const chatIds = new Set();

// Function to start the stream
async function startStream() {
    try {
        // Delete existing rules
        const existingRules = await twitterClient.v2.streamRules();
        if (existingRules.data?.length) {
            const ids = existingRules.data.map(rule => rule.id);
            await twitterClient.v2.updateStreamRules({
                delete: { ids: ids },
            });
            console.log('Deleted existing stream rules.');
        }

        // Add new rules
        const rules = [
            { value: `from:${process.env.TWITTER_USER_ID}`, tag: 'User Tweets' },
        ];

        await twitterClient.v2.updateStreamRules({
            add: rules,
        });
        console.log('Added new stream rules.');

        // Start stream
        const stream = await twitterClient.v2.searchStream({
            'tweet.fields': ['author_id', 'text', 'created_at'],
        });

        stream.autoReconnect = true;

        stream.on(ETwitterStreamEvent.Data, async tweet => {
            console.log('Received tweet:', tweet.data.text);
            await forwardTweet(tweet.data);
        });

        stream.on(ETwitterStreamEvent.Error, error => {
            console.error('Stream error:', error);
        });

        stream.on(ETwitterStreamEvent.ConnectionError, err => {
            console.error('Connection error:', err);
        });

        stream.on(ETwitterStreamEvent.ConnectionClosed, () => {
            console.log('Connection closed. Reconnecting...');
            startStream();
        });

        console.log('Stream started and listening for tweets...');
    } catch (error) {
        console.error('Error starting stream:', error);
    }
}

async function forwardTweet(tweet) {
    const tweetUrl = `https://twitter.com/${process.env.TWITTER_USERNAME}/status/${tweet.id}`;
    const message = `<b>New tweet from @${process.env.TWITTER_USERNAME}</b>:\n\n${tweet.text}\n<a href="${tweetUrl}">View Tweet</a>`;

    const options = {
        parse_mode: 'HTML',
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

// Telegram bot command handlers
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
async function setupStream() {
    const stream = await twitterClient.v2.searchStream({
        'tweet.fields': ['author_id', 'created_at'],
    });

    stream.on(ETwitterStreamEvent.Data, tweet => {
        console.log(`Tweet from ${tweet.data.author_id}: ${tweet.data.text}`);
    });

    stream.on(ETwitterStreamEvent.Error, error => {
        console.error('Error:', error);
    });

    stream.on(ETwitterStreamEvent.ConnectionLost, () => {
        console.warn('Stream connection lost. Reconnecting...');
        setupStream();
    });
}

// Start the stream
// setupStream().catch(console.error);
startStream();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
