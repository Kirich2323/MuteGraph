const Discord = require('discord.js');
const fs = require('fs')
var cytosnap = require('cytosnap');
var puppeteer = require('puppeteer');
var cytoscape = require('cytoscape');

const client = new Discord.Client();
let config = require('./botconfig.json');
let token = config.token;
let prefix = config.prefix;

const dataFileName = './src/savedData.json';
const commanderRoleName = 'Bot commander';

var DefaultAvatarUrl = 'https://lh5.googleusercontent.com/-QTUUAiSPNHA/AAAAAAAAAAI/AAAAAAAAAXk/khjvc_3VjUc/photo.jpg?sz=200';

cytosnap.use(['cytoscape-dagre', 'cytoscape-cose-bilkent']);

var snap = cytosnap();
var image;
var isSnapInstantiated = false;

function createImage(_nodes, _edges, _style) {
    if (isSnapInstantiated) {
        return snap.shot({
            elements: { // http://js.cytoscape.org/#notation/elements-json
                nodes: _nodes,
                edges: _edges
            },
            layout: { // http://js.cytoscape.org/#init-opts/layout
                name: 'cose-bilkent' // you may reference a `cytoscape.use()`d extension name here
            },
            style: _style,
            resolvesTo: 'base64uri',
            format: 'png',
            width: 640,
            height: 480,
            background: 'transparent'
        });
    } else {
        return;
    }
}

function saveToFile(filename, object) {
    var jsonData = JSON.stringify(object);
    fs.writeFile(filename, jsonData, function(err) {
        if (err) {
            console.log(err);
        }
    });
}

snap.start().then(function() {
    isSnapInstantiated = true;
});

var muted_dict = {};

try {
    if (fs.existsSync(dataFileName)) {
        var contents = fs.readFileSync(dataFileName);
        muted_dict = JSON.parse(contents);
    }
} catch (err) {
    console.error(err)
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

function getSnowflake(str) {
    var snowflake;
    if (str.length > 3) {
        let left = 2;
        if (str[2] === '!') {
            left = 3;
        }
        snowflake = str.slice(left, str.length - 1);
    }
    return snowflake;
}

function getUserFromMembers(members, snowflake) {
    return members.get(snowflake);
}

function getNickNameFromSnowFlake(members, snowflake) {
    var user = getUserFromMembers(members, snowflake);

    if (user) {
        if (user.nickname) {
            return user.nickname;
        } else {
            return user.user.username;
        }
    } else {
        return;
    }
}

function getAvatarURLFromSnowFlake(members, snowflake) {
    var user = getUserFromMembers(members, snowflake);

    if (user) {
        let url = user.user.avatarURL;
        if (url) {
            url = url.slice(0, user.user.avatarURL.length - 4) + '64';
        }
        return url;
    } else {
        return;
    }
}

function appendToArrayInDict(dict, guild, key, value) {
    if (!(guild in dict)) {
        dict[guild] = {};
    }

    if (!(key in dict[guild])) {
        dict[guild][key] = [];
    }
    if (!dict[guild][key].includes(value)) {
        dict[guild][key].push(value);
    }
}

function sendHelp(channel) {
    channel.send('Usage:\n !help - shows this message\n !mute @mention1 @mention2 - adds relation: @mention2 is muted by @mention1 \n !unmute @mention1 @mention2 - @mention2 is unmuted by @mention1');
}

function renderImage(msg) {
    var values = genNodesEdgesAndStyle(msg);
    nodes = values[0];
    edges = values[1];
    style = values[2];

    return createImage(_nodes, edges, style);
}

function cleanUpData(channel) {
    let to_remove = [];
    let dict = muted_dict[channel.guild.id];
    for (let key in dict) {
        let left_nick = getNickNameFromSnowFlake(channel.members, key)
        for (idx in dict[key]) {
            let right_nick = getNickNameFromSnowFlake(channel.members, dict[key][idx]);
            if (!right_nick) {
                to_remove.push([key, dict[key][idx]]);
            }
        }
    }
    for (idx in to_remove) {
        dict[to_remove[idx][0]].splice(dict[to_remove[idx][0]].indexOf(to_remove[idx][1]), 1);
        if (dict[to_remove[idx][0]].length === 0) {
            delete dict[to_remove[idx][0]];
        }
    }
}

function muteCommand(args, msg) {
    if (!msg.member.roles.find(r => r.name === commanderRoleName)) {
        msg.channel.send("Ooops, only '" + commanderRoleName + "' can use this command");
        return;
    }

    let muter;
    let muted;
    if (args.length == 2) {
        muter = msg.author;
        muted = getUserFromMembers(msg.guild.members, getSnowflake(args[1]));
    } else if (args.length == 3) {
        muter = getUserFromMembers(msg.guild.members, getSnowflake(args[1]));
        muted = getUserFromMembers(msg.guild.members, getSnowflake(args[2]));
    } else {
        sendHelp(msg.channel);
        return;
    }
    if (!muter || !muted || muter == muted) {
        return;
    }
    appendToArrayInDict(muted_dict, msg.channel.guild.id, muter.id, muted.id);
    saveToFile(dataFileName, muted_dict);
    renderImage(msg);
    showCommand(args, msg);
}

function genStyle(id_to_avatarURL) {
    style = [ // http://js.cytoscape.org/#style
        {
            selector: 'node',
            style: {
                'background-image': 'data(image)',
                'background-fit': 'cover',
                'label': 'data(label)'
            }
        }, {
            selector: 'edge',
            style: {
                'line-color': 'red',
                'curve-style': 'bezier',
                'target-arrow-shape': 'triangle',
                'target-arrow-color': 'red'
            }
        }
    ]
    return style;
}


function genNodesEdgesAndStyle(msg) {
    var nodes = [];
    var edges = [];
    var id_to_avatarURL = {};

    dict = muted_dict[msg.channel.guild.id];
    for (let key in dict) {
        let left_avatar = getAvatarURLFromSnowFlake(msg.channel.members, key);
        let left_nick = getNickNameFromSnowFlake(msg.channel.members, key)
        if (!left_avatar) {
            left_avatar = DefaultAvatarUrl;
        }
        id_to_avatarURL[key] = left_avatar;
        nodes.push([key, left_nick]);
        for (idx in dict[key]) {
            let right_avatar = getAvatarURLFromSnowFlake(msg.channel.members, dict[key][idx]);
            let right_nick = getNickNameFromSnowFlake(msg.channel.members, dict[key][idx]);
            if (!right_avatar) {
                right_avatar = DefaultAvatarUrl;
            }
            id_to_avatarURL[dict[key][idx]] = right_avatar;
            if (right_nick) {
                nodes.push([dict[key][idx], right_nick]);
                edges.push({
                    data: {
                        'source': key,
                        'target': dict[key][idx],
                        directed: true
                    }
                });
            } else {
                //dict[key].splice(idx,1);
            }
        }
    }
    nodes = new Set(nodes);
    _nodes = [];
    for (let key of nodes) {
        _nodes.push({
            data: {
                'image': id_to_avatarURL[key[0]],
                'label': key[1],
                'id': key[0]
            }
        });
    }
    style = genStyle(id_to_avatarURL);
    console.log(_nodes);
    return [_nodes, edges, style];
}

function showCommand(args, msg) {
    cleanUpData(msg.channel);

    renderImage(msg).then((img) => {
        if (!img) {
            return;
        }

        var base64Data = img.replace(/^data:image\/png;base64,/, "");

        fs.writeFile("out.png", base64Data, 'base64', function(err) {
            msg.channel.send({
                files: [{
                    attachment: "out.png",
                    name: 'file.jpg'
                }]
            });
            if (err) {
                console.log(err);
            }
        });
    });
}

function unmuteCommand(args, msg) {
    if (!msg.member.roles.find(r => r.name === commanderRoleName)) {
        msg.channel.send("Ooops, only '" + commanderRoleName + "' can use this command");
        return;
    }
    cleanUpData(msg.channel);

    if (args.length == 3) {
        let left = getUserFromMembers(msg.guild.members, getSnowflake(args[1])).id;
        let right = getUserFromMembers(msg.guild.members, getSnowflake(args[2])).id;
        dict = muted_dict[msg.channel.guild.id];
        if (left in dict) {
            if (dict[left].includes(right)) {
                dict[left].splice(dict[left].indexOf(right), 1);
                if (dict[left].length === 0) {
                    delete dict[left];
                }
                saveToFile(dataFileName, muted_dict);
                renderImage(msg);
            }
        }
        showCommand(args, msg);
    } else if (args.length == 2) {

    } else {
        sendHelp(msg.channel);
    }
}

client.on('message', msg => {
    args = msg.content.replace(/\s+/g, ' ').split(' ');

    if (args[0] === prefix + "mute") {
        muteCommand(args, msg);
    } else if (args[0] === prefix + "show") {
        showCommand(args, msg);
    } else if (args[0] === prefix + "unmute") {
        unmuteCommand(args, msg);
        msg.channel.send('unmute');
    } else if (args[0] === prefix + "help") {
        sendHelp(msg.channel);
    }
});

client.login(token);