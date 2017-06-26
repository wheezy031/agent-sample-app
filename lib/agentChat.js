'use strict';

const util = require('util');
const request = require('request');
const config = require('../config/config');
//const transcript = require('../chats/transcript.json');
const mongoose = require('mongoose');
const KnowledgeBase = mongoose.model('KnowledgeBase');
const Sentiment = mongoose.model('Sentiment');

function getNextPingURL(linkArr) {
    for (let i = 0; i < linkArr.length; i++) {
        const link = linkArr[i];
        if (link['@rel'] === 'next') {
            return link['@href'].replace('/events', '/events.json');
        }
    }
}

class AgentChat {
    constructor(session, chatURL) {
        this.session = session;
        this.chatURL = chatURL;
        this.lineIndex = 0;
        this.chatPingInterval = 2000;
    }

    start(callback) {
        this.startChatSession((err, data) => {
            if (err) {
                callback(err);
            }
            else {
                callback(null);
                this.chatLink = data.chatLink;
                this.chatPolling();
            }
        });
    }

    startChatSession(callback) {
        console.log(`(startChatSession) In linkForNextChat: ${this.chatURL}`);

        const options = {
            method: 'POST',
            url: `${this.chatURL}.json?v=1&NC=true`,
            headers: {
                'Authorization': `Bearer ${this.session.getBearer()}`,
                'content-type': 'application/json',
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            json: true,
            body: {'chat': 'start'}
        };

        request(options, (error, response, body) => {
            if (error) {
                callback(`Failed to start chat session with error: ${JSON.stringify(error)}`);
            }
            else if(response.statusCode < 200 || response.statusCode > 299){
                callback(`Failed o start chat session with error: ${JSON.stringify(body)}`);
            }
            console.log(`Start chat session - body: ${body.chatLocation.link['@href']}`);
            callback(null, {
                chatLink: body.chatLocation.link['@href']
            });
        });
    }

    chatPolling(url) {
        if (!url) {
            url = this.chatLink + '.json?v=1&NC=true'
        }

        const options = {
            method: 'GET',
            url: url,
            headers: {
                'Authorization': `Bearer ${this.session.getBearer()}`,
                'content-type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            json:true
        };

        request(options, (error, response, body)=> {
            if (error) {
                console.error(`Agent polling failed. Error: ${JSON.stringify(error)}`);
                return;
            }
            else if(response.statusCode < 200 || response.statusCode > 299){
                console.error(`Agent polling failed. body: ${JSON.stringify(body)}`);
                return;
            }
            let events;
            let nextURL;

            if (body.chat && body.chat.error) {
                console.log(`Chat error: ${JSON.stringify(body.chat.error)}`);
                return;
            }

            if (body.chat && body.chat.events) {
                nextURL = `${getNextPingURL(body.chat.events.link)}&v=1&NC=true`;
                events = body.chat['events']['event'];
            }
            else {
                try {
                    nextURL = `${getNextPingURL(body.events.link)}&v=1&NC=true`;
                }
                catch (e) {
                    console.log(`Error getting the next URL link: ${e.message}, body=${JSON.stringify(body)}`);
                    return;
                }
                events = body['events']['event'];
            }

            if (events) {
                if (!Array.isArray(events)) { // The API send an object and not an array if there is 1 event only
                    events = [events];
                }
                for (let i = 0; i < events.length; i++) {
                    const ev = events[i];

                    if ((ev['@type'] === 'state') && (ev.state === 'ended')) {
                        return;
                    }
                    else if ((ev['@type'] === 'line') && (ev['source'] === 'visitor')) {
                        console.log(`(chatPolling) - line form visitor:${ev.text}`);

                        this.getResponse(ev.text); // FIXME: make this and getSentiment a promose in order to fire sendLine()
                        //this.sendLine();
                    }
                }
            }
            this.chatTimer = setTimeout(() => {
                this.chatPolling(nextURL);
            }, this.chatPingInterval);
        });
    }

    getResponse(visitorLine) {
        var botLine = undefined;
        const keywords = visitorLine.split(' ');
        console.log("(getResponse) - keywords: " + keywords);
        var self = this;

        var callback = function(line, keywords) {
            self.getSentiment(line, keywords);
        };

        if(keywords.length < 1) {
            console.log("(getResponse) - no keywords found");
            callback(botLine, keywords);
            return 0;
        };

        for(let i=0; i < keywords.length; i++) {
            var keyword = keywords[i];
            console.log("(getResponse) - Checking Keyword: " + keyword);

            KnowledgeBase
                .findOne({ keyword : keyword })
               // .where('keyword').equals(keyword)
                .exec(function (err, line) {
                    console.log("(getResponse) - Response: " + line);
                    if (err) {
                        console.log("(getResponse) - Error finding response to visitor");
                    } else {
                        if (line !== null && line !== undefined) {
                            botLine = line.response;
                        }
                    }

                    if(i === keywords.length-1) {
                        console.log("(getResponse) - returning botLine: " + botLine);
                        callback(botLine, keywords);
                        return 0;
                    }
                });
        }
    }

    getSentiment(botLine, keywords) {
        var sentiment = undefined;
        var self = this;

        var callback = function(line, sentiment) {
            self.sendLine(line, sentiment);
        };

        if(keywords.length < 1) {
            console.log("(getSentiment) - no keywords found");
            this.sendLine(botLine, undefined);
            return 0;
        };

        for(let i=0; i < keywords.length; i++) {
            var keyword = keywords[i];
            console.log("(getSentiment) - Checking Keyword: " + keyword);

            Sentiment
                .findOne({ word : keyword })
                //.where('word').equals(keyword)
                .exec(function (err, response) {
                    console.log("(getSentiment) - response: " + response);
                    if (err) {
                        console.log("(getSentiment) - Error finding sentiment of visitor");
                    } else {
                        console.log("(getSentiment) - Found sentiment", response);
                        if (response !== null && response !== undefined) {
                            sentiment = response.type;
                        }
                    }

                    if(i === keywords.length-1) {
                        console.log("(getSentiment) - returning sentiment: " + sentiment);
                        callback(botLine, sentiment);
                        return 0;
                    }
                });
        }
    }

    sendLine(botLine, dbSentiment) {
        //const line = transcript[this.lineIndex];
        var line = (botLine !== undefined) ? botLine : "I'm sorry, I don't understand the question";
        const sentiment = (dbSentiment !== undefined) ? dbSentiment : "positive";
        if(sentiment === "negative") {
            line = "I'm sorry, I will transfer you to a human operator";
        }

        if (!line) {
            this.stop(err => {
                if (err) {
                    console.log(`Error stopping chat err: ${err.message}`);
                }
            });
            return;
        }


        console.log(`Sending line: ${line}`);
        const options = {
            method: 'POST',
            url: `${this.chatLink}/events.json?v=1&NC=true`,
            headers: {
                'Authorization': `Bearer ${this.session.getBearer()}`,
                'content-type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            json: true,
            body: {
                event: {
                    '@type': 'line',
                    'text': `<p dir='ltr' style='direction: ltr; text-align: left;'>${line}</p>`,
                    'textType': 'html'
                }
            }
        };

        setTimeout(() => {
            request(options, (error, response, body) => {
                this.lineIndex++;
                if (error) {
                    console.log(`Error sending line. Error: ${JSON.stringify(error)}`);
                }
                else if(response.statusCode < 200 || response.statusCode > 299){
                    console.log(`Error sending line. Body: ${JSON.stringify(body)}`);

                }
                console.log(`Send line: ${JSON.stringify(body)}`);

                if(sentiment === "negative") {
                    this.transferVisitor();
                }
            });
        }, config.chat.minLineWaitTime);
    }

    transferVisitor() {
        // TODO: transfer then remove conversation from bot.
        // Think about logic regarding transfer to agent or skill based on availability and/or additinal configuration?
        // For now it is probably much more simple to add an input to the app that accepts a xfer skill and check availability
    }

    stop(callback) {
        clearTimeout(this.chatTimer);
        clearTimeout(this.incomingTimer);

        if (this.chatLink) {
            const options = {
                method: 'POST',
                url: `${this.chatLink}/events.json?v=1&NC=true`,
                headers: {
                    'Authorization': `Bearer ${this.session.getBearer()}`,
                    'content-type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                json: true,
                body: {
                    event: {
                        '@type': 'state',
                        'state': 'ended'
                    }
                }
            };
            request(options, (error, response, body) => {
                if (error) {
                    callback(`Error trying to end chat: ${JSON.stringify(error)}`);
                }
                else if(response.statusCode < 200 || response.statusCode > 299){
                    callback(`Error trying to end chat: ${JSON.stringify(body)}`);
                }
                this.session.stop(err => {
                    if (err) {
                        console.log(`Error stopping session: ${err.message}`);
                        callback(err);
                    }
                    else {
                       callback();
                    }
                });
            });
        }else{
            callback(`Chat link is unavailable chatLink: ${this.chatLink}`);
        }
    }

}

module.exports = AgentChat;
