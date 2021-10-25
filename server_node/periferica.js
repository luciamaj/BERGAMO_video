// CONFIG BASE DIRECTORY
global.__basedir = __dirname;

// MARK - DECLARATIONS
const os = require('os');
const ioclient = require('socket.io-client');
const commands = require('./modules/commands.js');
const fs = require('fs');
const ini = require('ini');
const configIni = ini.parse(fs.readFileSync(__basedir + "/config.ini", 'utf-8'));
const fsUtilites = require('./modules/fs-utilities.js');
const path = require('path');
var ping = require('ping');
var cors = require('cors');
const dgram = require('dgram');

const passwordProtected = require('express-password-protect');

const config = {
    username: "bergamo",
    password: "900",
    maxAge: 120000
}

// EXPRESS

const express = require('express');
const app = express();
app.use(passwordProtected(config))
app.use(cors());

app.options('*', cors());
let mustacheExpress = require('mustache-express');

const bodyParser = require('body-parser');
app.set('view engine', 'mustache');
app.engine('mustache', mustacheExpress());
app.use(express.static(configIni.app.adminPath + '/public'));

const interface = require('./routes/interface')
app.use('/', interface);

app.use(bodyParser.json());

// FINE EXPRESS

let centrale = ioclient(configIni.connection.centrale);
let port = configIni.connection.io;
let clientSocket = null;
let appSocket = null;

//INFO MACHINE
const machineName = os.hostname();
const name = configIni.info.name;
const baseAppUrl = configIni.app.baseUrl;

// VARIABILI DI RUNTIME
let isAppOffline = true;
let socketError = false;

//INFO TO SEND TO CENTRALE
let infoDebug = {
    "error-chromiumcrashed": null,
    "error-pageerror": null,
    "error-requestfailed": null,
    "console": []
}

var server = app.listen(port, function () {
    var host = server.address().address
    var port = server.address().port

    console.log("Example app listening at http://%s:%s", host, port);
});

let serverUDP = dgram.createSocket('udp4');

serverUDP.on('listening', function () {
    console.log("dgram listening", 5000);
});

serverUDP.on('message', function(msg) {
    if (msg == 'videoEnd') {
        if (appSocket) {
            fsUtilites.writeLogFile("invio videoEnd a client");
            appSocket.emit("videoEnd");
        } else {
            console.log("something went wrong videoEnd, appSocket does not exists");
        }
    }
});

serverUDP.bind(5000);

app.get('/', function (req, res) {
    res.sendFile(path.join(__dirname + '/layout/index.html'));
});

const io = require('socket.io')(server, {
    origins: '*:*'
});

//  MARK - WEBSOCKET METHODS
centrale.on('connect', function () {
    console.log(`connected to central`);

    emitPeriferica();
    fsUtilites.writeLogFile("connected to central");
});

centrale.on("connect_error", async function () {
    if (!socketError) {
        console.log("CENTRALE è OFFLINE");
        socketError = true;
        fsUtilites.writeLogFile("central is off");
    }
});

centrale.on('disconnect', function () {
    console.log(`disconnected from central`);
    fsUtilites.writeLogFile('disconnected from central');
});

centrale.on('cmd', async function (data) {
    console.log(data, `ho ricevuto il cmd from central`);
    fsUtilites.writeLogFile('ho ricevuto il cmd from central ' + data);


    await commands.executeCmd(data);

    refresh();
}.bind(this));

centrale.on('config', async function (data) {
    console.log(data, `from central`);
    socketError = false;

    // scrivo il file di backup
    if(data != null && data != "") {
        fsUtilites.writeConfFile(data);
        fsUtilites.writeLogFile('ricevuta la configurazione');
    } else {
        console.log("received null data");
        fsUtilites.writeLogFile("received null data");
    }
});

io.on('connection', function (socket) {
    socket.on('chrome', async function () {
        clientSocket = socket;

        let res = await ping.promise.probe(configIni.connection.centraleIp, {
            timeout: configIni.connection.pingCentraleTimeoutSeconds,
            extra: ['-i', '2'],
        });
        
        if(res.alive) {
            fsUtilites.writeLogFile("centrale is online, opening: ", baseAppUrl + getAppPage());
            sendChangePage(getAppPage());
            isAppOffline = false;
            emitPeriferica();
        } else {
            fsUtilites.writeLogFile("pinged, centrale is offline, opening: ", baseAppUrl + getAppPage());
            sendChangePage(getAppPage());
            isAppOffline = false;
            emitPeriferica();
        }
    }.bind(this));

    socket.on('client', function () {
        fsUtilites.writeLogFile('sono client');
        isAppOffline = false;
        appSocket = socket;
        emitPeriferica();
        console.log("il client è connesso")
    }.bind(this));

    socket.on('approfondimento', function (data) {
        console.log("appro", data);
        sendUdpMessage(data);
    }.bind(this));

    socket.on('back', function (data) {
        console.log("back", data);
        sendUdpMessage(data);
    }.bind(this));

    socket.on('videoEnd', function (data) {
        console.log("back", data);
        sendUdpMessage(data);
    }.bind(this));

    socket.on('disconnect', function () {

        // TODO: Oltre a fare solo l'update di quando mi sconnetto devo reinviare le mie info con le segnalazioni
        console.log(`${socket.id} disconnected`);

        if (socket == clientSocket || socket == appSocket) {
            fsUtilites.writeLogFile('disconnessa applicazione ' + baseAppUrl + getAppPage());
            clientSocket = undefined;
            isAppOffline = true;
            emitPeriferica();
        }
    }.bind(this));
});

function sendChangePage(url) {
    // FORM FULL URL
    var pattern = /^((http|https):\/\/)/;

    let urlComplete = "";

    if (pattern.test(url)) {
        urlComplete = url; 
    } else {
        urlComplete = baseAppUrl + url;
    }

    if (clientSocket) {
        configIni.app.prepend ? clientSocket.emit('loadPage', urlComplete + configIni.app.prepend) : clientSocket.emit('loadPage', url); 
    }
}


function refresh() {
    if (clientSocket) {
        clientSocket.emit('refresh');
    }
}

async function emitPeriferica(errorOp) {    
    if (errorOp) {
        infoDebug["errorOperation"] = {'success': false, error: errorOp};
    } else {
        infoDebug["errorOperation"] = {'success': true, error: null}
    }

    if (isAppOffline || isAppOffline == null) {
        infoDebug["error-pageerror"] = true;
    } else { 
        infoDebug["error-pageerror"] = null;
    }

    centrale.emit('periferica', {
        machineName: machineName,
        name: name,
        infoDebug: infoDebug,
    });
}

// Questa funzione apre la pagina sul file di backup. Se il file di backup non è presente avviene il resirect sull'app specificate nel file.ini
function getAppPage() {
    let backupConfig = null;

    try { 
        backupConfig = JSON.parse(fs.readFileSync(__basedir + '/data/backup-config.json', 'utf-8')); } 
    catch (err) {
        console.log(err);
        fsUtilites.writeLogFile(err);
    }

    let appUrl = '';

    if (backupConfig) {
        if (backupConfig.app && configIni.info.useCentrale) {
            console.log("Ho letto il file di config", backupConfig);
            appUrl = backupConfig.app;
            fsUtilites.writeLogFile(`Ho letto il file di config ${backupConfig.app}`);
        } else {
            console.log("Sto usando l'app di backup dall'ini");
            appUrl = configIni.app.backupAppUrl;
            fsUtilites.writeLogFile("Sto usando l'app di backup dall'ini, backupConfig.app non valorizzato");
        }
    } else {
        fsUtilites.writeLogFile("Sto usando l'app di backup dall'ini, backup config parsing failed");
        console.log("Sto usando l'app di backup dall'ini, backup config parsing failed");
        appUrl = configIni.app.backupAppUrl;
    }

    return appUrl;
}

function sendPeriferica(error) {
    console.log('sono qui con questo errore', error);
    emitPeriferica(error)
}

function sendUdpMessage(data) {
    if (data) {
        console.log("1", data);
        const messageBuffer = Buffer.from(data);
        serverUDP.send(messageBuffer, 0, messageBuffer.length, configIni.bs.port, configIni.bs.ip);
    
        fsUtilites.writeLogFile(`send udp to ${configIni.bs.ip}:${configIni.bs.port}, ${data}`);
    } else {
        console.log("data is undefined");
    }
}

exports.sendPeriferica = sendPeriferica;