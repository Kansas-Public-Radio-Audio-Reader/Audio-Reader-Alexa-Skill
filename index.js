/*
 * _________________________
 *  A U D I O   R E A D E R
 *  A L E X A   S K I L L
 * ========================
 *
 * Developer: Danny Mantyla
 * Date: November 2017
 * Update Fall 2019: rewrote it for the new version Alexa-SDK node.js module
 * Update July 2021: changed it to download JSON data from KPR web server
 */

'use strict';

const Alexa = require('alexa-sdk');
const https = require('https');
const APP_ID = 'amzn1.ask.skill.8f10c20e-4de7-43de-b1b9-e6a3e1da1bfd';  
const STREAMURL = "https://kansaspublicradio.org/audioreader.m3u";
const ARCHIVEURL = 'https://kprprdarswb.cc.ku.edu/archive/'; // need trailing slash, needs to be HTTPS
var dataSourceURL =   'https://kansaspublicradio.org/widgets/audio-reader/ar-data.json';

// constants
const languageStrings = {
    'en': {
        translation: {
            SKILL_NAME: 'Audio Reader',
            HELP_MESSAGE: 'You can say "listen to Audio Reader," "play on demand," "what is Audio Reader playing right now," or "what is the Audio Reader program schedule." Which would you like me to do?',
            HELP_REPROMPT: 'If you are having trouble listening to Audio Reader, you can call our tech support at <say-as interpret-as="telephone">785-864-2238</say-as>.',
            STOP_MESSAGE: 'Thank you for listening!',
            LAUNCH_MESSAGE: 'Audio Reader is a reading service for the blind and print disabled. You can ask me to play the live stream, play on demand, tell you what is being read right now, or what is the Audio Reader program schedule.',
            LAUNCH_MESSAGE_REPROMPT: 'Would you like me to play audio reader, play on-demand, tell you what is playing right now, or read the program schedule?',
            DO_NOT_UNDERSTAND_MESSAGE: "I'm sorry but I don't understand.",
            NOW_PLAYING_MESSAGE: 'Say "Play the live stream" if you would like to listen to this program, or ask me to play on-demand if you would like to listen to a different program',
            NOW_PLAYING_MESSAGE_REPROMPT: 'Say "Play the live stream" if you would like to listen to this program.',
        },
    },
    'en-US': {
        translation: {
            SKILL_NAME: 'Audio Reader',
        },
    },
    'en-GB': {
        translation: {
            SKILL_NAME: 'Audio Reader',
        },
    },
    
};


// handlers
const handlers = {
    
    // custume intents
    'LaunchRequest': function () {
        this.response.speak(this.t('LAUNCH_MESSAGE')).listen(this.t('LAUNCH_MESSAGE_REPROMPT'));
        this.emit(':responseReady');
    },
    
    'getAudioReaderProgramGuideIntent': function () {
        var responseText = '';
        var intentObj = this.event.request.intent;
        if (intentObj.slots.date.value) {
            var dateObj = new Date(intentObj.slots.date.value);
            var dayISOnumber = dateObj.getISODay();
        } else if (intentObj.slots.day.value) {
            var dateObj = day2Date(intentObj.slots.day.value);
            var dayISOnumber = dateObj.getISODay();
        } else {
            var dayIsonumber = null;
        }
        
        // get the program data from the server and then do stuff with it
        // notice that, instead of normal annonymous function, the arrow function expression is used: () => {}
        // this is because it allows us to use the 'this' binding of the parent function inside the lambda function
        // https://stackoverflow.com/questions/20279484/how-to-access-the-correct-this-inside-a-callback
        https.get(dataSourceURL, (response) => {
            let todo = '';

            // called when a data chunk is received.
            response.on('data', (chunk) => {
                todo += chunk;
            });

            // called when the complete response is received.
            response.on('end', () => {
                var data = JSON.parse(todo);
                console.log(data);
                var responseText = getAudioReaderProgramScheduleSSML(data, dayISOnumber);
                this.response.speak(responseText).listen(this.t('LAUNCH_MESSAGE_REPROMPT'));
                this.emit(':responseReady');
            });

        }).on("error", (error) => {
            console.log("Error: " + error.message);
        });
        
    },
    
    'getNowPlayingIntent': function () {
        // get the program data from the server and then do stuff with it
        // notice that, instead of normal annonymous function, the arrow function expression is used: () => {}
        // this is because it allows us to use the 'this' binding of the parent function inside the lambda function
        // https://stackoverflow.com/questions/20279484/how-to-access-the-correct-this-inside-a-callback
        https.get(dataSourceURL, (response) => {
            let todo = '';

            // called when a data chunk is received.
            response.on('data', (chunk) => {
                todo += chunk;
            });

            // called when the complete response is received.
            response.on('end', () => {
                var data = JSON.parse(todo);
                var responseString = getNowPlayingSSML(data);
                this.response.speak(responseString + this.t('NOW_PLAYING_MESSAGE')).listen(this.t('NOW_PLAYING_MESSAGE_REPROMPT'));
                this.emit(':responseReady');
            });

        }).on("error", (error) => {
            console.log("Error: " + error.message);
        });
    },
    
    'playLiveStreamIntent': function() {
        
        // This is the function that plays the live stream - the primary focus of this Alexa skill.
        // we must confirm that the user claims to be blind.
        // there is a required propt setup in the language interaction model (in the Alexa Skill Kit platform) 
        // To use it we "deligate" it to Alexa via the delegate dialoge directive.
        
        if (this.event.request.dialogState === 'STARTED') {
            // Pre-fill slots: update the intent object with slot values for which
            // you have defaults, then emit :delegate with this updated intent.
            //var updatedIntent = this.event.request.intent;
            //updatedIntent.slots.SlotName.value = 'DefaultValue';
            //this.emit(':delegate', updatedIntent);
            this.emit(':delegate');
        } else if (this.event.request.dialogState !== 'COMPLETED'){
            this.emit(':delegate');
        } else {
            // completed
            var intentObj = this.event.request.intent;
            if (intentObj.confirmationStatus !== 'CONFIRMED') {
                // not confirmed
                if (intentObj.confirmationStatus !== 'DENIED') {
                    // Intent is completed, not confirmed but not denied
                    this.emit(':tell', "You have neither confirmed or denied that you are blind. Please try again.");
                } else {
                    // Intent is completed, denied and not confirmed
                    this.emit(':ask', 'I am sorry but you cannot listen to Audio Reader if you are not blind or print disabled.');
                }
            } else {
                // intent is completed and confirmed. Success!
                var words = "Now playing Audio Reader's live stream.";
                this.response.speak(words).audioPlayerPlay("REPLACE_ALL", STREAMURL, "1", null, 0); //(behavior, url, token, expectedPreviousToken, offsetInMilliseconds)
                this.emit(':responseReady');
            }
        }
        
    },
    
    'playOnDemandIntent': function() {
        
        // autodelegate must be on
        
        // get the name of the program they gave to Alexa:
        var programTitle = this.event.request.intent.slots.programNameSlot.value;
        
        // correct any problems with the title string
        var titleReplacements = {
            'regional news central and western kansas':'regional news: central & western ks',
            'regional news of central and western kansas':'regional news: central & western ks',
            'regional news eastern kansas':'regional news: eastern ks',
            'regional news of eastern kansas':'regional news: eastern ks',
            'regional news':'regional news: eastern ks',
            'south east kansas newspapers ':'southeast kansas newspapers',
            'home and family magazines ':'home & family magazines',
            'oh the oprah magazine ':'o, the oprah magazine',
            'the oprah magazine ':'o, the oprah magazine',
            'oprah magazine ':'o, the oprah magazine',
            'u. s. a. today':'usa today',
            'u.s.a. today':'usa today',
            'on line the computer show':'on-line (the computer show)',
            'on-line the computer show':'on-line (the computer show)',
            'online the computer show':'on-line (the computer show)',
            'the online computer show':'on-line (the computer show)',
            'national and international news ':'national & international news',
            'sunday new york times arts':'sunday new york times - arts',
            'sunday new york times book review':'sunday new york times - book review',
            'sunday new york times business':'sunday new york times - business',
            'sunday new york times magazine':'sunday new york times - magazine',
            'sunday new york times travel':'sunday new york times - travel',
            'sunday new york times':'sunday new york times - magazine',
            'arts and letters live':'arts & letters live',
            'arts and letters':'arts & letters live',
            'business and economy news':'business & economy news',
            'business and economy':'business & economy news',
            'childrens hour ':"children's hour",
            'playing with words poetry':'playing with words (poetry)',
            'playing with words':'playing with words (poetry)',
            'prairie fire readings in kansas history':'prairie fire: readings in kansas history',
            'prairie fire':'prairie fire: readings in kansas history',
            'game show ':'the game show',
            'look back':'a look back',
            'book club':'the book club',
            'morning newspapers':'breakfast table times: kansas city star',
            'breakfast table':'breakfast table times: kansas city star',
            'coupon':'shopping the discount stores',
            'playing with words':'playing with words (poetry)',
            'playing with words poetry':'playing with words (poetry)',
            't.v. guide':'tv guide',
            't. v. guide':'tv guide',
            'lawrence journal world':'lawrence journal-world',
            'lawrence journal':'lawrence journal-world',
            'journal world':'lawrence journal-world',
            'lj world':'lawrence journal-world',
            'l. j. world':'lawrence journal-world',
            'kansas city star':'breakfast table times: kansas city star',
            'kansas city':'breakfast table times: kansas city star',
            'kansas city newspaper':'breakfast table times: kansas city star',
            'kc star':'breakfast table times: kansas city star',
            'topeka capital journal':'breakfast table times: topeka capital journal',
            'capital journal':'breakfast table times: topeka capital journal',
            'topeka newspaper':'breakfast table times: topeka capital journal',
        };
        programTitle = programTitle.toLowerCase();
        if (programTitle in titleReplacements) {
            programTitle = titleReplacements[programTitle];
        }
        
        // get the program data from the server and then do stuff with it
        // notice that, instead of normal annonymous function, the arrow function expression is used: () => {}
        // this is because it allows us to use the 'this' binding of the parent function inside the lambda function
        // https://stackoverflow.com/questions/20279484/how-to-access-the-correct-this-inside-a-callback
        https.get(dataSourceURL, (response) => {
            let todo = '';

            // called when a data chunk is received.
            response.on('data', (chunk) => {
                todo += chunk;
            });

            // called when the complete response is received.
            response.on('end', () => {
                var data = JSON.parse(todo);
        
                // get the mp3 and offset from the Audio Reader Javascript Library
                // properties of the object are:
                //   mp3url, the url of the mp3 file
                //   offset, in microseconds
                //   dateString, the day it was recorded
                var onDemandObj = getOnDemandAudio(data, programTitle);
        
                // build the response
                if (onDemandObj) {
                    var words = "Now playing the latest recording of " + programTitle + " from " + onDemandObj.dateString + ", on Audio Reader.";
                    var mp3url = ARCHIVEURL + onDemandObj.mp3;
                    this.response.speak(words).audioPlayerPlay("REPLACE_ALL", mp3url, "1", null, onDemandObj.offset); //(behavior, url, token, expectedPreviousToken, offsetInMilliseconds)
                    this.emit(':responseReady');
                } else {
                    this.response.speak(this.t("I couldn't find a program called " + programTitle + ". If you would like to try again, you can say, play on demand, play the live stream, or read me the program guide.")).listen(this.t('LAUNCH_MESSAGE_REPROMPT'));
                    this.emit(':responseReady');
                }
            });

        }).on("error", (error) => {
            console.log("Error: " + error.message);
        });
    },
    
    // default intents
    'AMAZON.HelpIntent': function () {
        const speechOutput = this.t('HELP_MESSAGE');
        const reprompt = this.t('HELP_MESSAGE');
        this.emit(':ask', speechOutput, reprompt);
    },
    'AMAZON.CancelIntent': function () {
        this.response.audioPlayerStop();
        this.emit(':responseReady');
    },
    'AMAZON.StopIntent': function () {
        this.response.audioPlayerStop();
        this.emit(':responseReady');
    },
    'AMAZON.PauseIntent': function () {
        this.response.audioPlayerStop();
        this.emit(':responseReady');
    },
    'AMAZON.ResumeIntent': function () {
        this.response.audioPlayerPlay("REPLACE_ALL", STREAMURL, "1", null, 0);
        this.emit(':responseReady');
    },
    
    'Unhandled': function () {
        this.emit('playLiveStreamIntent');
    },
};



exports.handler = function (event, context) {
    const alexa = Alexa.handler(event, context);
    alexa.APP_ID = APP_ID;
    // To enable string internationalization (i18n) features, set a resources object.
    alexa.resources = languageStrings;
    alexa.registerHandlers(handlers);
    alexa.execute();
};


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
    var western = false; // flag for western feed which is a slightly different mp3 url format since it the same time,day,week
    if (show.title.includes("Central & Western")) {
        western = true;
    }
    
    // this function returns an object
    var returnObject = {};
    returnObject.mp3 = buildMp3Filename(show, numWeeksAgo, western);
    
    // now get the offset and date and time and stuff
    var minute = show.time.substring(2,4);
    var milliseconds = parseInt(minute) * 60000; // alexa wants the offset in milliseconds
    returnObject.offset = milliseconds;
    console.log(milliseconds);
    var dateString = day2latestDate(show, numWeeksAgo, false).toPrettyString(); 
    returnObject.dateString = dateString;
    
    return returnObject;
};

// return string that is URL to the audio for the show
// Format: XXDayYYYY.mp3 where XX is the number of week of the year, Day is the day of the week, and YYYY is the time in military format
var buildMp3Filename = function(show, numWeeksAgo, western) {
    numWeeksAgo = numWeeksAgo || 0;  // number of weeks in the past
    western = western || false; // flag for western feed which is different format

    var now = getAudioReaderTime(); // local time for Audio Reader, not the node.js server or the echo devise or whatever

    // shows can start at any time of the hour, but audio on the server is (mostly) only in 1-hour-long segments (usually, but not always...)
    // must break down the time to hour, and then pass in the minutes to have the player start in the middle or wherever
    var time = fixTime(show.time);
    var hour = time.substring(0,2);
    var duration = length2hours(show.length);

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
    
    if (western) {
        var mp3url = '' + week + show.day.substring(0, 2) + hour + '00w.mp3'; // must have leading slash. Western feed ends with 'w' and only has to chars in day
    } else {
        var mp3url = '' + week + show.day + hour + '00.mp3'; // must have leading slash
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
    console.log('schedule');
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

// convert military time to standard time
var convertTime = function(fourDigitTime) {
    fourDigitTime = fixTime(fourDigitTime);
    var hours24 = Number(fourDigitTime.substring(0, 2),10);
    var hours = ((hours24 + 11) % 12) + 1;
    var amPm = hours24 > 11 ? 'pm' : 'am';
    var minutes = fourDigitTime.substring(2);
    return hours + ':' + minutes + amPm;
};

// fix the time so that 800 is 0800
var fixTime = function (fourDigitTime) {
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
    var now = new Date(),
        time = fixTime(show.time),
        hour = Number(time.substring(0,2)),
        minute = Number(time.substring(2,4));
    
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