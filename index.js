/*
 * _________________________
 *  A U D I O   R E A D E R
 *  A L E X A   S K I L L
 * ========================
 *
 * Developer: Danny Mantyla
 *
 * Version 1.0:
 *     November 2017
 *     Initional version
 * Version 2.0:
 *     Fall 2019
 *     re-write for v2 Alexa-SDK node.js module
 * Version 2.1: 
 *     July 2021
 *     changed it to download JSON data from KPR web server
 * Version 3.0: 
 *     April 2022
 *     re-write to save user's confirmation response 
 *     and reorganize the data-structure to use Alexa.SkillBuilders.custom()
 * Version 3.1:
 *     October 2022
 *     Added the KC stream and KC on-demand programs
 * Version 3.2:
 *     Added Pittsburg Today
 */

'use strict';

const Alexa = require('ask-sdk-core');
const https = require('https');
const ddbAdapter = require('ask-sdk-dynamodb-persistence-adapter');
const AWS = require("aws-sdk");

const APP_ID = 'amzn1.ask.skill.8f10c20e-4de7-43de-b1b9-e6a3e1da1bfd';  
const STREAMURL = "https://portal.kansaspublicradio.org/audioreader.m3u";
const KCSTREAMURL = "https://portal.kansaspublicradio.org/audioreaderkc.m3u";
const ARCHIVEURL = 'https://ondemand.audioreader.net/archive/'; // need trailing slash, needs to be HTTPS
const dataSourceURL = 'https://portal.kansaspublicradio.org/widgets/audio-reader/ar-data.json';

var regionData = {
	  'KC Newspapers':'k',
	  //'Western Kansas Newspapers':'w',
	  //'Pittsburg':'p',
	  //'Springfield':'s',
	  'KC Life: Arts & Culture':'k',
    'KC Life: Business':'k',
    'KC Life: Opinion & Politics':'k',
    'KC Life: Sports':'k',
    'KC Life: Community':'k',
    'The Newsroom Hour':'k'
};

const words = {
            SKILL_NAME: 'Audio Reader',
            HELP_MESSAGE: 'You can say "listen to the live stream," "listen to the Kansas City stream," "play on demand," "what is Audio Reader playing right now," or "what is the Audio Reader program schedule." Which would you like me to do?',
            HELP_REPROMPT: 'If you are having trouble listening to Audio Reader, you can call our tech support at <say-as interpret-as="telephone">785-864-2238</say-as>.',
            STOP_MESSAGE: 'Thank you for listening!',
            LAUNCH_MESSAGE: 'Audio Reader is a reading service for the blind and print disabled. You can ask me to play the live stream, play the kansas city stream, play on demand, tell you what is being read right now, or what is the Audio Reader program schedule.',
            LAUNCH_MESSAGE_SHORT: 'Welcome back to Audio Reader. You can ask me to play the live stream, play the Kansas City stream, play on demand, tell you what is being read right now, or what is the Audio Reader program schedule.',
            LAUNCH_MESSAGE_REPROMPT: 'Would you like me to play the audio reader stream, the kansas city stream, play on-demand, tell you what is playing right now, or read the program schedule?',
            DO_NOT_UNDERSTAND_MESSAGE: "I'm sorry but I don't understand.",
            NOW_PLAYING_MESSAGE: 'Say "Play the live stream" if you would like to listen to this program, or ask me to play on-demand if you would like to listen to a different program',
            NOW_PLAYING_MESSAGE_REPROMPT: 'Say "Play the live stream" if you would like to listen to this program.',
            FALLBACK_MSG: 'Sorry, I don\'t know about that. Please try again.',
            ERROR_MSG: 'Sorry, there was an error. Please try again.',
            HELP_MSG: 'You can say "listen to Audio Reader," "play the Kansas City stream," "play on demand," "what is Audio Reader playing right now," or "what is the Audio Reader program schedule." Which would you like me to do?',
            REPROMPT_MSG: `If you're not sure what to do next try asking for help. If you want to leave just say stop. What would you like to do next? `,
            GOODBYE_MSG: 'Goodbye!',
}

//  intents
const LaunchRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
    },
    async handle(handlerInput) {
        
        // check if they've been here before and if so then give a shorter intro speech
        const attributesManager = handlerInput.attributesManager;
        const attributes = await attributesManager.getPersistentAttributes() || {};
        console.log('attributes is: ', attributes);
        const isBlind = attributes.hasOwnProperty('isBlind')? attributes.isBlind : false;
        
        var introSpeech = words.LAUNCH_MESSAGE;
        if (isBlind) introSpeech = words.LAUNCH_MESSAGE_SHORT;
        
        return handlerInput.responseBuilder
            .speak(introSpeech)
            .reprompt(words.LAUNCH_MESSAGE_REPROMPT)
            .getResponse();
    }
};
    
const getAudioReaderProgramGuideIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'getAudioReaderProgramGuideIntent';
    },
    async handle(handlerInput) {
        var responseText = '';
        var dateObj;
        var dayISOnumber;
        var intentObj = handlerInput.requestEnvelope.request.intent;
        
        if (intentObj.slots.date.value) {
            dateObj = new Date(intentObj.slots.date.value);
            dayISOnumber = dateObj.getISODay();
        } else if (intentObj.slots.day.value) {
            dateObj = day2Date(intentObj.slots.day.value);
            dayISOnumber = dateObj.getISODay();
        } else {
            dayISOnumber = null;
        }
            
        // get the program data from the server and then do stuff with it
        let promise = new Promise((resolve, reject) => {
            var data = '';
            https.get(dataSourceURL, res => {
                res.on('data', chunk => { data += chunk }) 
                res.on('end', () => {
                   resolve(JSON.parse(data));
                })
            }) 
        });
        
        let result = await promise; // wait until the promise resolves
        var guideText = getAudioReaderProgramScheduleSSML(result, dayISOnumber);
        return handlerInput.responseBuilder
            .speak(guideText)
            .reprompt(words.LAUNCH_MESSAGE_REPROMPT)
            .getResponse();
    }    
};
    
 const getNowPlayingIntentHandler =  {
    
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'getNowPlayingIntent';
    },
    async handle(handlerInput) {
    
        // get the program data from the server and then do stuff with it
        let promise = new Promise((resolve, reject) => {
            var data = '';
            https.get(dataSourceURL, res => {
                res.on('data', chunk => { data += chunk }) 
                res.on('end', () => {
                   resolve(JSON.parse(data));
                })
            }) 
        });
        
        let result = await promise; // wait until the promise resolves
        var responseString = getNowPlayingSSML(result);
        return handlerInput.responseBuilder
            .speak(responseString)
            .reprompt(words.LAUNCH_MESSAGE_REPROMPT)
            .getResponse();
    }
};
    
const playLiveStreamIntentHandler = {
    // This is the function that plays the live stream - the primary focus of this Alexa skill.
    // we must confirm that the user claims to be blind.
    // there is a required prompt setup in the language interaction model (in the Alexa Skill Kit platform) 
    // To use it we "deligate" it to Alexa via the delegate dialoge directive.
    
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'playLiveStreamIntent';
    },
    async handle(handlerInput) {
        const requestObj = handlerInput.requestEnvelope;
        if ((requestObj.request.dialogState === 'STARTED') || (requestObj.request.dialogState === 'IN_PROGRESS')) {
            
            //check if they've already said they're blind
            const attributesManager = handlerInput.attributesManager;
            const attributes = await attributesManager.getPersistentAttributes() || {};
            console.log('attributes is: ', attributes);
            const isBlind = attributes.hasOwnProperty('isBlind')? attributes.isBlind : false;
            
            var token = Math.floor(Math.random() * 100000000);
            
            // if they've already said they're blind, then play the live stream, else delegate the prompt dialoge
            if (isBlind) {
                return handlerInput.responseBuilder
                    .speak('Now playing Audio Reader\'s live stream.')
                    .addAudioPlayerPlayDirective("REPLACE_ALL", STREAMURL, token, null, 0)
                    .getResponse();
            } else {
                return handlerInput.responseBuilder
                    .addDelegateDirective(requestObj.request.intent)
                    .getResponse();
            }
        } else {
            // completed
            var intentObj = requestObj.request.intent;
            if (intentObj.confirmationStatus !== 'CONFIRMED') {
                // not confirmed
                if (intentObj.confirmationStatus !== 'DENIED') {
                    // Intent is completed, not confirmed but not denied
                    return handlerInput.responseBuilder
                        .speak("You have neither confirmed or denied that you are blind. Please try again.")
                        .reprompt(words.LAUNCH_MESSAGE_REPROMPT)
                        .getResponse();
                } else {
                    // Intent is completed, denied and not confirmed
                    return handlerInput.responseBuilder
                        .speak('I am sorry but you cannot listen to Audio Reader if you are not blind or print disabled.')
                        .reprompt(words.LAUNCH_MESSAGE_REPROMPT)
                        .getResponse();
                }
            } else {
                // intent is completed and confirmed. Success!

                // first, save their prompt answer so we don't have to ask them again
                const attributesManager = handlerInput.attributesManager;
                const sessionAttributes = attributesManager.getSessionAttributes();
                sessionAttributes['isBlind'] = true;
                console.log('Saving to persistent storage: isBlind = true');
                attributesManager.setPersistentAttributes(sessionAttributes);
                await attributesManager.savePersistentAttributes();

                // now play the live stream
                return handlerInput.responseBuilder
                    .speak('Now playing Audio Reader\'s live stream.')
                    .addAudioPlayerPlayDirective("REPLACE_ALL", STREAMURL, "1", null, 0)
                    .getResponse();
            }
        }
    }
};

const playKansasCityStreamIntentHandler = {
    
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'playKansasCityStreamIntent';
    },
    async handle(handlerInput) {
        const requestObj = handlerInput.requestEnvelope;
        if ((requestObj.request.dialogState === 'STARTED') || (requestObj.request.dialogState === 'IN_PROGRESS')) {
            
            //check if they've already said they're blind
            const attributesManager = handlerInput.attributesManager;
            const attributes = await attributesManager.getPersistentAttributes() || {};
            console.log('attributes is: ', attributes);
            const isBlind = attributes.hasOwnProperty('isBlind')? attributes.isBlind : false;
            
            // if they've already said they're blind, then play the live stream, else delegate the prompt dialoge
            if (isBlind) {
                return handlerInput.responseBuilder
            .speak('Now playing our Kansas City stream.')
                    .addAudioPlayerPlayDirective("REPLACE_ALL", KCSTREAMURL, "1", null, 0)
                    .getResponse();
            } else {
                return handlerInput.responseBuilder
                    .addDelegateDirective(requestObj.request.intent)
                    .getResponse();
            }
        } else {
            // completed
            var intentObj = requestObj.request.intent;
            if (intentObj.confirmationStatus !== 'CONFIRMED') {
                // not confirmed
                if (intentObj.confirmationStatus !== 'DENIED') {
                    // Intent is completed, not confirmed but not denied
                    return handlerInput.responseBuilder
                        .speak("You have neither confirmed or denied that you are blind. Please try again.")
                        .reprompt(words.LAUNCH_MESSAGE_REPROMPT)
                        .getResponse();
                } else {
                    // Intent is completed, denied and not confirmed
                    return handlerInput.responseBuilder
                        .speak('I am sorry but you cannot listen to Audio Reader if you are not blind or print disabled.')
                        .reprompt(words.LAUNCH_MESSAGE_REPROMPT)
                        .getResponse();
                }
            } else {
                // intent is completed and confirmed. Success!

                // first, save their prompt answer so we don't have to ask them again
                const attributesManager = handlerInput.attributesManager;
                const sessionAttributes = attributesManager.getSessionAttributes();
                sessionAttributes['isBlind'] = true;
                console.log('Saving to persistent storage: isBlind = true');
                attributesManager.setPersistentAttributes(sessionAttributes);
                await attributesManager.savePersistentAttributes();

                // now play the live stream
                return handlerInput.responseBuilder
                    .speak('Now playing our Kansas City stream.')
                    .addAudioPlayerPlayDirective("REPLACE_ALL", KCSTREAMURL, "1", null, 0)
                    .getResponse();
            }
        }
    }
};
    
const playOnDemandIntentHandler =  {
    
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'playOnDemandIntent';
    },
    async handle(handlerInput) {
        
        // get the name of the program they gave to Alexa:
        var intentObj = handlerInput.requestEnvelope.request.intent;
        var programTitle = intentObj.slots.programNameSlot.value;
            
        // correct any problems with the title string
        var titleReplacements = {
            'african american hour':'the african american hour',
            'discount stores':'shopping the discount stores',
            'playing with words':'playing with words (poetry)',
            'poetry':'playing with words (poetry)',
            'playing with words poetry':'playing with words (poetry)',
            'outside':'outdoors',
            'religion':'inspiration and religion',
            'guide posts':'guideposts',
            'economy news':'business and economy news',
            'business news':'business and economy news',
            'home on the range':'at home on the range',
            'look back':'a look back',
            'the wall street journal':'wall street journal',
            'u.s.a. today':'usa today',
            'new york times':'the new york times',
            'travel':'sunday new york times - travel',
            'magazine':'sunday new york times - magazine',
            'business':'sunday new york times - business',
            'new york times business':'sunday new york times - business',
            'book reviews':'sunday new york times - book reviews',
            'new york times book reviews':'sunday new york times - book reviews',
            'new york times arts':'sunday new york times - arts',
            'sunday travel':'sunday new york times - travel',
            'sunday magazine':'sunday new york times - magazine',
            'sunday business':'sunday new york times - business',
            'sunday new york times business':'sunday new york times - business',
            'sunday book reviews':'sunday new york times - book reviews',
            'sunday new york times book reviews':'sunday new york times - book reviews',
            'sunday new york times arts':'sunday new york times - arts',
            'international news':'national and international news',
            'national news':'national and international news',
            'national and international news':'national and international news',
            'good health':'to your good health',
            'sports':'sports show',
            'readers digest':'readers digest / saturday eventing post',
            'saturday evening post':'readers digest / saturday evening post',
            'the computer show':'on-line (the computer show)',
            'online the computer show':'on-line (the computer show)',
            'online':'online (the computer show)',
            'home and family magazine':'home & family magazine',
            'wichita newspaper':'wichita eagle',
            'wichita newspapers':'wichita eagle',
            'the wichita eagle':'wichita eagle',
            'lawrence times':'the lawrence times',
            'sunflower newspapers':'sunflower dailies',
            'southeast kansas':'southeast kansas newspapers',
            'regional papers western kansas':'western kansas newspapers',
            'regional papers kansas city':'regional newspapers: kansas city region',
            'kansas city regional':'regional newspapers: kansas city region',
            'kansas city metro newspapers':'regional newspapers: kansas city metro',
            'kansas city newspapers':'kansas city metro newspapers',
            'regional papers eastern kansas':'eastern kansas newspapers',
            'eastern kansas':'eastern kansas newspapers',
            'regional news papers central kansas':'central kansas newspapers',
            'breakfast table times lawrence journal world':'lawrence journal-world',
            'breakfast table times lj world':'lawrence journal-world',
            'breakfast table times kc star':'kansas city metro newspapers',
            'breakfast table times kansas city star':'kansas city metro newspapers',
            'central kansas':'central kansas newspapers',
            'missouri newspapers':'missouri news hour',
            'sunday kc star':'kansas city star - sunday',
            'saturday kc star':'kansas city star - saturday',
            'kc star sunday':'kansas city star - sunday',
            'kc star saturday':'kansas city star - saturday',
            'sunday kansas city star':'kansas city star - sunday',
            'saturday kansas city star':'kansas city star - saturday',
            'kansas city star sunday':'kansas city star - sunday',
            'kansas city star saturday':'kansas city star - saturday',
            'sunday capital journal':'topeka capital journal - sunday',
            'saturday capital journal':'topeka capital journal - saturday',
            'sunday topeka capital journal':'topeka capital journal - sunday',
            'saturday topeka capital journal':'topeka capital journal - saturday',
            'topeka capital journal sunday':'topeka capital journal - sunday',
            'topeka capital journal saturday':'topeka capital journal - saturday',
            'capital journal':'breakfast table times',
            'topeka capital journal':'breakfast table times',
            'book hour':'non-fiction book hour',
            'lj world':'lawrence journal-world',
            'kansas city star':'kansas city metro newspapers',
            't. v. guide':'tv guide',
            'home and family magazines':'home & family magazine',
            'on-line the computer show':'on-line (the computer show)',
            'regional news':'central kansas newspapers',
            'u. s. a. today':'usa today',
            'mystery book hour':'mystery hour',
            'lawrence journal world':'lawrence journal-world',
            'l. j. world':'lawrence journal-world',
            'kansas city life': 'kc life: opinion & politics',
            'kc life arts and culture':'kc life: arts & culture',
            'kc life business':'kc life: business',
            'kc life opinion and politics':'kc life: opinion & politics',
            'kc life sports':'kc life: sports',
            'kansas city life arts and culture':'kc life: arts & culture',
            'kansas city life business':'kc life: business',
            'kansas city life opinion and politics':'kc life: opinion & politics',
            'kansas city life sports':'kc life: sports',
            'kc live sports':'kc life: sports',
            'k.c. live sports':'kc life: sports',
            'kansas city live sports':'kc life: sports',
            'newsroom':'the newsroom hour',
            'the newsroom':'the newsroom hour',
            'newsroom hour':'the newsroom hour',
            'pittsburg':'pittsburg today',
            'pittsburgh':'pittsburg today',
            'pittsburgh today':'pittsburg today',
        };
        programTitle = programTitle.toLowerCase();
        if (programTitle in titleReplacements) {
            programTitle = titleReplacements[programTitle];
        }
        
        // get the program data from the server and then do stuff with it
        let promise = new Promise((resolve, reject) => {
            var data = '';
            https.get(dataSourceURL, res => {
                res.on('data', chunk => { data += chunk }) 
                res.on('end', () => {
                   resolve(JSON.parse(data));
                })
            }) 
        });
        
        let result = await promise; // wait until the promise resolves
        
        // get the mp3 and offset from the Audio Reader Javascript Library
        // properties of the object are:
        //   mp3url, the url of the mp3 file
        //   offset, in microseconds
        //   dateString, the day it was recorded
        var onDemandObj = getOnDemandAudio(result, programTitle);
        
        var token = programTitle; // gotta be unique, this should be good enough
    
        // build the response
        if (onDemandObj) {
            var goodwords = "Now playing the latest recording of " + programTitle + " from " + onDemandObj.dateString + ", on Audio Reader.";
            var mp3url = ARCHIVEURL + onDemandObj.mp3;
            return handlerInput.responseBuilder
                .speak(goodwords)
                .addAudioPlayerPlayDirective("REPLACE_ALL", mp3url, token, null, 0) // onDemandObj.offset)
                .getResponse();
        } else {
            var badwords = "I couldn't find a program called " + programTitle + ". If you would like to try again, you can say, play on demand, play the live stream, or read me the program guide.";
            return handlerInput.responseBuilder
                .speak(badwords)
                .reprompt(words.LAUNCH_MESSAGE_REPROMPT)
                .getResponse();
        }
    }
};

const HelpIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent';
    },
    handle(handlerInput) {
        const speechText = words.HELP_MSG;

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(speechText)
            .getResponse();
    }
};

const CancelAndStopIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && (Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.CancelIntent'
                || Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.StopIntent');
    },
    handle(handlerInput) {
        const speechText = words.GOODBYE_MSG;

        return handlerInput.responseBuilder
            //.speak(speechText)
            .addAudioPlayerStopDirective()
            .getResponse();
    }
};

const PauseAudioIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.PauseIntent';
    },
    async handle(handlerInput) {
        return handlerInput.responseBuilder
            .addAudioPlayerStopDirective()
            .getResponse();
    }
};

/* *
 * FallbackIntent triggers when a customer says something that doesn’t map to any intents in your skill
 * It must also be defined in the language model (if the locale supports it)
 * This handler can be safely added but will be ingnored in locales that do not support it yet 
 * */
const FallbackIntentHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest'
            && Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent';
    },
    handle(handlerInput) {
        const speechText = words.FALLBACK_MSG;
        
        console.log('~~FALLBACK TRIGGERED~~')

        return handlerInput.responseBuilder
            .speak(speechText)
            .reprompt(words.REPROMPT_MSG)
            .getResponse();
    }
};
/* *
 * SessionEndedRequest notifies that a session was ended. This handler will be triggered when a currently open 
 * session is closed for one of the following reasons: 1) The user says "exit" or "quit". 2) The user does not 
 * respond or says something that does not match an intent defined in your voice model. 3) An error occurs 
 * */
const SessionEndedRequestHandler = {
    canHandle(handlerInput) {
        return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
    },
    handle(handlerInput) {
        console.log(`~~~~ Session ended: ${JSON.stringify(handlerInput.requestEnvelope)}`);
        // Any cleanup logic goes here.
        return handlerInput.responseBuilder.getResponse(); // notice we send an empty response
    }
};

/**
 * Generic error handling to capture any syntax or routing errors. If you receive an error
 * stating the request handler chain is not found, you have not implemented a handler for
 * the intent being invoked or included it in the skill builder below 
 * */
const ErrorHandler = {
    canHandle() {
        return true;
    },
    handle(handlerInput, error) {
        //const speechText = handlerInput.t('ERROR_MSG');
        //console.log(`~~~~ Error handled: ${JSON.stringify(error)}`);
        console.log(`~~~~ Error handled: ${error}`);
        
        console.log(handlerInput)

        return handlerInput.responseBuilder
            .speak("Sorry, there was an error. Please try again.")
            .reprompt('Please try again.')
            .getResponse();
    }
};
// This request interceptor will log all incoming requests to this lambda
const LoggingRequestInterceptor = {
    process(handlerInput) {
        console.log(`Incoming request: ${JSON.stringify(handlerInput.requestEnvelope)}`);
    }
};

// This response interceptor will log all outgoing responses of this lambda
const LoggingResponseInterceptor = {
    process(handlerInput, response) {
        console.log(`Outgoing response: ${JSON.stringify(response)}`);
    }
};



/* *
 * Below we use async and await ( more info: javascript.info/async-await )
 * It's a way to wrap promises and waait for the result of an external async operation
 * Like getting and saving the persistent attributes
 * 
 */
const LoadAttributesRequestInterceptor = {
    async process(handlerInput) {
        const {attributesManager, requestEnvelope} = handlerInput;
        if (Alexa.isNewSession(requestEnvelope)){ //is this a new session? this check is not enough if using auto-delegate (more on next module)
            const persistentAttributes = await attributesManager.getPersistentAttributes() || {};
            console.log('Loading from persistent storage: ' + JSON.stringify(persistentAttributes));
            //copy persistent attribute to session attributes
            attributesManager.setSessionAttributes(persistentAttributes); // ALL persistent attributtes are now session attributes
        }
    }
};


// If you disable the skill and reenable it the userId might change and you loose the persistent attributes saved below as userId is the primary key
const SaveAttributesResponseInterceptor = {
    async process(handlerInput, response) {
        if (!response) return; // avoid intercepting calls that have no outgoing response due to errors
        const {attributesManager, requestEnvelope} = handlerInput;
        const sessionAttributes = attributesManager.getSessionAttributes();
        const shouldEndSession = (typeof response.shouldEndSession === "undefined" ? true : response.shouldEndSession); //is this a session end?
        if (shouldEndSession || Alexa.getRequestType(requestEnvelope) === 'SessionEndedRequest') { // skill was stopped or timed out
            // we increment a persistent session counter here
            sessionAttributes['sessionCounter'] = sessionAttributes['sessionCounter'] ? sessionAttributes['sessionCounter'] + 1 : 1;
            // we make ALL session attributes persistent
            console.log('Saving to persistent storage:' + JSON.stringify(sessionAttributes));
            attributesManager.setPersistentAttributes(sessionAttributes);
            await attributesManager.savePersistentAttributes();
        }
    }
};


exports.handler = Alexa.SkillBuilders.custom()
    .addRequestHandlers(
        LaunchRequestHandler,
        getAudioReaderProgramGuideIntentHandler,
        getNowPlayingIntentHandler, 
        playLiveStreamIntentHandler,
        playKansasCityStreamIntentHandler,
        playOnDemandIntentHandler,
        HelpIntentHandler,
        CancelAndStopIntentHandler,
        PauseAudioIntentHandler,
        FallbackIntentHandler,
        SessionEndedRequestHandler)
    .addErrorHandlers(ErrorHandler)
    .addRequestInterceptors(
        LoggingRequestInterceptor,
        LoadAttributesRequestInterceptor
        )
    .addResponseInterceptors(
        LoggingResponseInterceptor,
        SaveAttributesResponseInterceptor
        )
    .withPersistenceAdapter(
        new ddbAdapter.DynamoDbPersistenceAdapter({
            tableName: process.env.DYNAMODB_PERSISTENCE_TABLE_NAME,
            createTable: false,
            dynamoDBClient: new AWS.DynamoDB({apiVersion: 'latest', region: process.env.DYNAMODB_PERSISTENCE_REGION})
        }))
    .lambda();











/* ------ A U D I O   R E A D E R   J A V A S C R I P T   L I B R A R Y------ */
/* -------------------- ported for Amazon Skill Kit ------------------------- */

/*
 * G E T   O N   D E M A N D   A U D I O
 * returns:
 *   an object with:
 *     mp3
 *     offset - in milliseconds
 *     dateString - date in a nice formate ex) January 1st, 2016
 *   or false if failure
 */
var getOnDemandAudio = function(data, title) {
    if ((title == 'undefined') || (title == '') || (title == null)) {
        console.log('getOnDemandMp3 was given bad `title` input, value given: ' + title)
        return false;
    }
    
    // get all the shows and sort by day
    var shows = data.filter(function(x) {
        return x.title.trim().toLowerCase() === title.trim().toLowerCase();
    }).sort(function(x,y) {
        return day2number(x.day) - day2number(y.day);
    });
    
    // get the show that played last.  sort by how long ago it played from today
    if (shows.length > 1) {
        var show = shows.reduce(function(x, y) {
            // you have two shows. Find and return the one that was played more recently. 
            var xDate = day2latestDate(x, 0, true);
            var yDate = day2latestDate(y, 0, true);
            if ((Number(xDate) - Number(yDate)) > 0) {
                 return x;
            } else {
                 return y;
            }
        });
    } else {
        var show = shows[0];
    }

    if (typeof show == 'undefined') {
        console.log('in getOnDemandMp3: the show ' + title + ' could not be found.');
        return false;
    }
    
    // now start building the mp3 url
    var numWeeksAgo = 0;  // number of weeks in the past
    var region = getRegion(show.title);
    
    // this function returns an object
    var returnObject = {};
    returnObject.mp3 = buildMp3Filename(show, numWeeksAgo, region);
    
    // now get the offset and date and time and stuff
    var minute = show.time.substring(2,4);
    var milliseconds = parseInt(minute) * 60000; // alexa wants the offset in milliseconds
    returnObject.offset = milliseconds;
    var dateString = day2latestDate(show, numWeeksAgo, false).toPrettyString(); 
    returnObject.dateString = dateString;
    
    return returnObject;
};

// return string that is URL to the audio for the show
// Format: XXDayYYYY.mp3 where XX is the number of week of the year, Day is the day of the week, and YYYY is the time in military format
var buildMp3Filename = function(show, numWeeksAgo, region) {
    numWeeksAgo = numWeeksAgo || 0;  // number of weeks in the past
    region = region || false; // flag for western feed which is different format

    var now = getAudioReaderTime(); // local time for Audio Reader, not the node.js server or the echo devise or whatever

    // shows can start at any time of the hour, but audio on the server is (mostly) only in 1-hour-long segments (usually, but not always...)
    // must break down the time to hour, and then pass in the minutes to have the player start in the middle or wherever
    var time = fixTime(show.time);
    var hour = time.substring(0,2);
    var minute = time.substring(2,4);
    //var duration = length2hours(show.length);

    // make the week-of-the-year number to append at beginning of mp3 url
    // if this show hasnnot played yet this week, then set it back to last week
    var thisWeek = now.getWeek(); 
    if (happeningNow(show) || (now.getISODay() < day2number(show.day)) || ((now.getISODay() == day2number(show.day)) && (now.getHours() <= Number(hour)))) {
        numWeeksAgo++; 
    }
    var week = thisWeek - numWeeksAgo; 
    if (week < 1) {
        // TODO: replace 52 with the actual number of weeks in the previous year. Every 6 or 7 years there is 53 weeks
        week = 52 + week; // i.e. 52 + (-10) == 42
    }
    week = week.toString(); // convert to a string
    if (week.length == 1) {
        week = '0' + week;
    }
    
    if (region) {
        var mp3url = '' + week + show.day.substring(0, 2) + hour + minute + region + '.mp3'; // must have leading slash. Western feed ends with 'w' and only has to chars in day
    } else {
        var mp3url = '' + week + show.day + hour + minute + '.mp3'; // must have leading slash
    }
    return mp3url;
}

    
/* 
 * G E T   N O W   P L A Y I N G   S S M L
 * returns SSML words of what's now playing
 */
var getNowPlayingSSML = function(data) {
    console.log('now playing');

    // get the day and time
    var now = getAudioReaderTime();
    var nowDay = now.getISODay(); // day of week, 0-6, not date of month
    var nowHours = now.getHours();
    var nowMinutes = now.getMinutes();

    // make it look like what is in our csv data
    if (nowMinutes < 10) {
        nowMinutes = 10;
    } else {
        nowMinutes = nowMinutes - (nowMinutes % 10); // round down to nearest 10
    }
    
    var nowTime = nowHours.toString() + nowMinutes.toString(); // military time
    nowDay = number2day(nowDay);
    
    // filter out data first by day, then by hour
    // if nothing is found then rewind by 10 minutes and search again
    var isShowDayEqualNowDay = function(show) { return show.day == nowDay; };
    var isShowTimeEqualNowTime = function(show) { return parseInt(show.time) == parseInt(nowTime); };
    var nowPlayingShows = [], 
    i=60; // 60 x 10 minutes = 600 minutes = 10 hours
    while ((nowPlayingShows.length === 0) && (i > 0)) {
        nowPlayingShows = data.filter(isShowDayEqualNowDay).filter(isShowTimeEqualNowTime);
        nowTime = (parseInt(nowTime) - 10).toString();
        i--;
        // TODO: this is buggy! Betweeen 11:00am and 11:10am, it is wrong.
    }

    if (i === 0) {
        console.log("Couldn't find Now Playing show. nowTime: " + nowTime + ", nowDay: " + nowDay);
        return "I'm sorry but I could not determine what is being read on Audio Reader at the moment.";
    } else {
        var nowPlayingShow = nowPlayingShows[0];
        return '<s>' + nowPlayingShow.title.sanatizeForSSML() + ' is being read right now on Audio Reader.</s>';
    }
    
};


/*
 * GET AUDIO READER PORGRAM SCHEDULE SSML
 * return SSML descripting the day's schedule
 */
var getAudioReaderProgramScheduleSSML = function (data, day) {
    var now = new Date();
    day = day || now.getISODay(); // day of the week, monday is 0, sunday is 6
    
    var sunday = {'name':'Sunday', 'shows':[]}, 
        monday = {'name':'Monday', 'shows':[]}, 
        tuesday = {'name':'Tuesday', 'shows':[]},
        wednesday = {'name':'Wednesday', 'shows':[]}, 
        thursday = {'name':'Thursday', 'shows':[]}, 
        friday = {'name':'Friday', 'shows':[]}, 
        saturday = {'name':'Saturday', 'shows':[]};
        
    // sort the show objects by time (does not matter what day)
    data.sort(function(a,b) {
        return a.time - b.time;
    });
    
    // put the shows in the respective array for the day
    data.forEach( function(show) {
        if (show.day == 'Sun') {
            sunday.shows.push(show);
        } else if (show.day == 'Mon' ) {
            monday.shows.push(show);
        } else if (show.day == 'Tue' ) {
            tuesday.shows.push(show);
        } else if (show.day == 'Wed' ) {
            wednesday.shows.push(show);
        } else if (show.day == 'Thu' ) {
            thursday.shows.push(show);
        } else if (show.day == 'Fri' ) {
            friday.shows.push(show);
        } else if (show.day == 'Sat' ) {
            saturday.shows.push(show);
        } else {
            console.log('Error: Could not determine the day of a show from the data.');
        }
    });
    
    var days = [monday, tuesday, wednesday, thursday, friday, saturday, sunday]; // ISO says monday is first day of the week
    
    var returnString = '';
    
    var listItems = days[day].shows.map(function(show) {
        return '<s>At <say-as interpret-as="time">' + convertTime(show.time) + '</say-as> is ' + show.title.trim().sanatizeForSSML() + '.</s>';
    });
    returnString += '<p>Here is the Audio Reader schedule for ' + number2longDay(day) + '.</p> <p>' + listItems.join(" ") + '</p>';

    
    return returnString;
    
    
};


/* ---------------------------- helper functions ---------------------------- */

// is the show happening now? 
function happeningNow(show) {
    var now = new Date();
    var time = fixTime(show.time);
    var hour = time.substring(0,2);
    var minute = show.time.substring(2,4);
    var duration = length2hours(show.length);

    if ((now.getISODay() == day2number(show.day)) &&  
           ((now.getHours() >= Number(hour)) && (now.getHours() < (Number(hour) + duration))) &&
           (now.getMinutes() >= Number(minute)) &&
           (now.getMinutes() - Number(minute) <= (duration * 60))) {
        return true;
    }
    return false;
}

// figure out what region, if any, from a shows title.
// Returns false if no region
function getRegion(showTitle) {
    /*
    var region = false;
    if (showTitle.includes("Central & Western")) {
        region = "w";
    } else if (showTitle.includes("Springfield")) {
        region = "s";
    } else if (showTitle.includes("Pittsburg")) {
        region = "p";
    } else if (showTitle.includes("KC Life")) {
        region = "k";
    } else if (showTitle.includes("KC Newspapers")) {
        region = "k";
    }
    return region;
    */
    if (showTitle in regionData) {
        return regionData[showTitle];
    } else {
    	  return false;
    }
}

// convert military time to standard time
var convertTime = function(fourDigitTime) {

    // special condition for Pittsburg files
    if (fourDigitTime == "PITT") {
       return '(not applicable)';
    }

    fourDigitTime = fixTime(fourDigitTime);
    var hours24 = Number(fourDigitTime.substring(0, 2),10);
    var hours = ((hours24 + 11) % 12) + 1;
    var amPm = hours24 > 11 ? 'pm' : 'am';
    var minutes = fourDigitTime.substring(2);
    return hours + ':' + minutes + amPm;
};

// fix the time so that 800 is 0800
var fixTime = function (fourDigitTime) {

    // special condition for files that don't have an air time (like Pittsburg)
    if (isNaN(Number(fourDigitTime))) {
       return fourDigitTime;
    }

    if (fourDigitTime == '0') {
       return '0000';
    } else if (fourDigitTime.length == 3) {
       return '0'+fourDigitTime;
    } else {
       return fourDigitTime;
    }
};

// return the latest Date a show aired, given the show object and (optional) number of weeks ago, and nowPlaying flag (optional)
function day2latestDate(show, weeksAgo, nowPlaying) {
    weeksAgo = weeksAgo || 0;
    nowPlaying = nowPlaying || false;
    var now = getAudioReaderTime();
    var time = fixTime(show.time);

    // special condition for files that don't have an air time (like Pittsburg)
    if (!isNaN(Number(time))) {
        var hour = Number(time.substring(0,2));
        var minute = Number(time.substring(2,4));
    } else {
        var hour = '00';
        var minute = '00';
    }
    
    var diff = now.getISODay() - day2number(show.day);
    
    // if it is later in the week, then knock it back a week
    if (diff < 0) { 
        diff += 7; 
    }
    // if it is the same day as today but later in the day... knock it back a week
    // if nowPlaying flag on, leave duration at 0. This lets the "now playing" feature work for the Catalog.
    var duration = -1;
    if (nowPlaying) {
        duration = 0;
    } else {
        duration = length2hours(show.length);
    }
    if ((diff === 0) && ((now.getHours() - (hour + duration)) < 0)) {
        diff += 7; 
    }
    // now adjust for however many weeks ago, if any
    if (weeksAgo > 0) {
        diff += weeksAgo * 7;
    }
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, hour, minute);
}

// convert "30min" or "2hrs" to a usable number of hours
function length2hours(length) {
    
    if (length.match(/min/)) {
        // Minutes. Get the numbers only, then convert minutes to hours
        return Number(length.replace(/\D/g,'')) / 60;
    } else if (length.match(/hr/)) {
        // Hours. Just need to remove non digits
        return Number(length.replace(/\D/g,''));
    } else {
        // default case: assume it is 1 hour
        console.log('Warning: function length2hours() guessed that the show is 1 hour long');
        return 1;
    }
    
    // use this line if data contains number of minutes instead:
    //return length/60; 
}

// convert day, i.e. 'Mon', to a number. Sunday is 0.
function day2number(day) {
    day = day.toLowerCase();
    var weekday = new Array(14);
    weekday['mon'] = 0;
    weekday['tue'] = 1;
    weekday['wed'] = 2;
    weekday['thu'] = 3;
    weekday['fri'] = 4;
    weekday['sat'] = 5;
    weekday['sun'] = 6;
    weekday['monday'] = 0;
    weekday['tueday'] = 1;
    weekday['wednesday'] = 2;
    weekday['thursday'] = 3;
    weekday['friday'] = 4;
    weekday['saturday'] = 5;
    weekday['sunday'] = 6;
    return weekday[day];
}

// convert number to a day name, i.e. 3 to 'Wed'. Sunday is 0.
function number2day(num) {
    var weekdays = new Array(7);
    weekdays[0] = "Mon";
    weekdays[1] = "Tue";
    weekdays[2] = "Wed";
    weekdays[3] = "Thu";
    weekdays[4] = "Fri";
    weekdays[5] = "Sat";
    weekdays[6] = "Sun";
    return weekdays[num];
}

// convert number to a day name, i.e. 3 to 'Wed'. Sunday is 0.
function number2longDay(num) {
    var weekdays = new Array(7);
    weekdays[0] = "Monday";
    weekdays[1] = "Tuesday";
    weekdays[2] = "Wednesday";
    weekdays[3] = "Thursday";
    weekdays[4] = "Friday";
    weekdays[5] = "Saturday";
    weekdays[6] = "Sunday";
    return weekdays[num];
}

// convert short day to long day format
function shortDay2longDay(shortDay) {
    return number2longDay(day2number(shortDay));
}

// convert a number to a month, i.e. 3 to March. January is 0.
function number2month(num) {
    var months = new Array(12);
    months[0] = 'January';
    months[1] = 'February';
    months[2] = 'March';
    months[3] = 'April';
    months[4] = 'May';
    months[5] = 'June';
    months[6] = 'July';
    months[7] = 'August';
    months[8] = 'September';
    months[9] = 'October';
    months[10] = 'November';
    months[11] = 'December';
    return months[num];
}

// make date ordinals
function nth(d) {
  if(d>3 && d<21) return d + 'th'; // thanks kennebec
  switch (d % 10) {
        case 1:  return d + "st";
        case 2:  return d + "nd";
        case 3:  return d + "rd";
        default: return d + "th";
    }
} 

// print dates in a nice format, ex) January 1st, 2016
Date.prototype.toPrettyString = function() {
    return number2longDay(this.getISODay()) + ', ' + number2month(this.getMonth()) + ' ' + nth(this.getDate()) + ', ' + this.getFullYear();
}

// Source: http://weeknumber.net/how-to/javascript 
// Returns the ISO week of the date.
Date.prototype.getWeek = function() {
    var date = new Date(this.getTime());
    date.setHours(0, 0, 0, 0);
    // Thursday in current week decides the year.
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    // January 4 is always in week 1.
    var week1 = new Date(date.getFullYear(), 0, 4);
    // Adjust to Thursday in week 1 and count number of weeks from date to week1.
    return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}
// Returns the four-digit year corresponding to the ISO week of the date.
Date.prototype.getWeekYear = function() {
    var date = new Date(this.getTime());
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    return date.getFullYear();
}

// need a ISO-8601 friendly Date.getDay() function
Date.prototype.getISODay = function(){ return (this.getDay() + 6) % 7; }

// helper function for ASK's SSML format
String.prototype.sanatizeForSSML = function() {
    return this.replace('[','').replace(']','').replace('&','and');
}

function day2Date(day) {
    var now = new Date();
    var diff = now.getISODay() - day2number(day);
    
    // if it is later in the week, then knock it back a week
    if (diff < 0) { 
        diff += 7; 
    }

    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
}
    
// returns the time of the location of Audio Reader (returns Date object)
// (we don't care what the local time of the device is, because Now Playing depends on when Audio Reader is playing it in their time zone)
function getAudioReaderTime() {
    var audioReaderTime = new Date().toLocaleString("en-US", {timeZone: "America/Chicago"});
    return new Date(audioReaderTime);
}



