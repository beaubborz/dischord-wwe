const https   = require('https');
const path    = require('path');
const request = require('request');
const Discord = require('discord.js');
const express = require('express');
const app     = express();
const aws     = require('aws-sdk');
const bot     = new Discord.Client();
const bucket  = new aws.S3({params: {Bucket: 'cena-bot'}});

const DEFAULT_HELLO = 'media/hello.ogg';
const DEFAULT_BYE   = 'media/bye.mp3';
const JOHN_KEYWORD  = 'john!';

const playFileInChannel = (vch, key, v = 0.5) => {
  if (!vch) {
    console.log(`error="voiceChannel is null"`);
    return;
  }

  bot.joinVoiceChannel(vch, (err, voiceConnection) => {
    if (err) {
      console.log(`error="${err}"`);
    }
    let url = bucket.getSignedUrl('getObject', {Key: key});
    console.log(`action=play_song channel="${voiceConnection.server.name}" key="${key} url="${url}"`);
    voiceConnection.playRawStream(request(url), {volume: v}, (error, streamIntent) => {
      if (error) {
        console.log(error, error.code);
        return;
      }

      streamIntent.on('error', (error) => {
        console.log(`error=${error}`);
      });

      streamIntent.on('end', () => {
        bot.leaveVoiceChannel(vch);
      });
    });
  });
};

const resetThemeSong = (userId) => {
  let key = `songs/${userId}`;
  console.log(`action=reset_song key=${key}`);
  bucket.deleteObject({Key: key}, (err) => {
    if (err) {
      console.log(`error=${err}`);
      return;
    }
  });
};

const uploadThemeSong = (msg) => {
  if (!msg.attachments) {
    console.log(`error="message has no attachments"`);
    return;
  }

  let url = msg.attachments[0].url;
  let ext = url.substring(url.lastIndexOf('.') + 1);

  if (!['mp3', 'wav', 'ogg'].includes(ext.toLowerCase())) {
    bot.reply(msg, `I can't play ${ext} files, bro!`);
    return;
  }

  console.log(`action=upload_song user="${msg.author.username}" url="${msg.attachments[0].url}"`);
  https.get(msg.attachments[0].url, (data) => {
    let key = `songs/${msg.author.id}`;

    bucket.upload({Body: data, Key: key}, (err) => {
      if (err) {
        console.log(`error=${err}`);
        return;
      }

      bot.reply(msg, `Damn, that's a fine theme song!`);
      playFileInChannel(msg.author.voiceChannel, key);
    });
  });
};

const hasTrigger = (mgs) => {
  msg.content.match(/john/gi);
}

Array.prototype.intersects = function (arr) {
  return this.filter((n) => {
    return arr.indexOf(n) > -1;
  });
};

Array.prototype.containsAll = function (arr) {
  return this.intersects(arr).length === arr.length;
};

bot.on('ready', () => {
  console.log(`action=login user=${bot.user.username}#${bot.user.id}`);
  bot.setPlayingGame(`WWE SMACKDOWN RAW 2016`);
});

bot.on('voiceJoin', (vch, User) => {
  if (vch === null) {
    return;
  }
  if (User.username === bot.user.username) {
    return;
  }

  console.log(`action=join_channel user=${User.username}`);

  let key = `songs/${User.id}`;
  bucket.headObject({Key: key}, (err) => {
    console.log(`action=fetch_song key=${key} exists=${!!err}`);
    if (err) {
      playFileInChannel(vch, DEFAULT_HELLO);
    } else {
      playFileInChannel(vch, key);
    }
  });
});

bot.on('voiceLeave', (vch, User) => {
  if (!vch) {
    return;
  }
  if (User.username === bot.user.username) {
    return;
  }
  if (typeof bot.voiceConnection !== 'undefined' && bot.voiceConnection.playing) {
    console.log(`action=bail reason="bot is already playing something. I should add it to a queue instead."`)
    return;
  }

  console.log(`action=leave_channel user=${User.username}`);
  playFileInChannel(vch, DEFAULT_BYE);
});

bot.on('message', (msg) => {
  if (msg.content.match(/(theme\ssong)|song|theme/gi)) {
    uploadThemeSong(msg);
    bot.reply(msg, `Damn straight! My theme song is way better!`);
  }

  if (hasTrigger(msg) && msg.content.match(/(?=.*reset)(?=.*song)/gi)) {
    resetThemeSong(msg);
    bot.reply(msg, `Damn straight! My theme song is way better!`);
  } else {
    bot.reply(msg, 'WHAT??!');
  }
});

bot.on('error', (err) => {
  console.log(`fatal_error=${err}`);
});

app.use('/', express.static(path.join(__dirname, '/public')));

app.get('/ping', (req, res) => {
  res.send({status: 'ok'});
});

const SERVER_PORT = process.env.PORT || 4000;
app.listen(SERVER_PORT, () => {
  console.log(`cena-bot-web running on ${SERVER_PORT}`);

  bot.loginWithToken(
    process.env.DISCORD_CLIENT_SECRET
  );
});
