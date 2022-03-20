"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postCandidate = exports.postAnswer = exports.postOffer = exports.deleteConnection = exports.createConnection = exports.deleteSession = exports.createSession = exports.getCandidate = exports.getAnswer = exports.getOffer = exports.getConnection = exports.checkSessionId = exports.reset = void 0;
var offer_1 = require("./offer");
var answer_1 = require("./answer");
var candidate_1 = require("./candidate");
var isPrivate;
// [{sessonId:[connectionId,...]}]
var clients = new Map();
// [{connectionId:[sessionId1, sessionId2]}]
var connectionPair = new Map(); // key = connectionId
// [{sessionId:[{connectionId:Offer},...]}]
var offers = new Map(); // key = sessionId
// [{sessionId:[{connectionId:Answer},...]}]
var answers = new Map(); // key = sessionId
// [{sessionId:[{connectionId:Candidate},...]}]
var candidates = new Map(); // key = sessionId
function getOrCreateConnectionIds(sessionId) {
    var connectionIds = null;
    if (!clients.has(sessionId)) {
        connectionIds = new Set();
        clients.set(sessionId, connectionIds);
    }
    connectionIds = clients.get(sessionId);
    return connectionIds;
}
function reset(mode) {
    isPrivate = mode == "private";
    clients.clear();
    connectionPair.clear();
    offers.clear();
    answers.clear();
    candidates.clear();
}
exports.reset = reset;
function checkSessionId(req, res, next) {
    if (req.url === '/') {
        next();
        return;
    }
    var id = req.header('session-id');
    if (!clients.has(id)) {
        res.sendStatus(404);
        return;
    }
    next();
}
exports.checkSessionId = checkSessionId;
function getConnection(req, res) {
    var sessionId = req.header('session-id');
    var arrayConnection = Array.from(clients.get(sessionId));
    var obj = arrayConnection.map(function (v) { return ({ connectionId: v }); });
    res.json({ connections: obj });
}
exports.getConnection = getConnection;
function getOffer(req, res) {
    // get `fromtime` parameter from request query
    var fromTime = req.query.fromtime ? Number(req.query.fromtime) : 0;
    var sessionId = req.header('session-id');
    var arrayOffers = [];
    if (offers.size != 0) {
        if (isPrivate) {
            if (offers.has(sessionId)) {
                arrayOffers = Array.from(offers.get(sessionId));
            }
        }
        else {
            var otherSessionMap = Array.from(offers).filter(function (x) { return x[0] != sessionId; });
            arrayOffers = [].concat.apply([], Array.from(otherSessionMap, function (x) { return Array.from(x[1], function (y) { return [y[0], y[1]]; }); }));
        }
    }
    if (fromTime > 0) {
        arrayOffers = arrayOffers.filter(function (v) { return v[1].datetime > fromTime; });
    }
    var obj = arrayOffers.map(function (v) { return ({ connectionId: v[0], sdp: v[1].sdp, polite: v[1].polite }); });
    res.json({ offers: obj });
}
exports.getOffer = getOffer;
function getAnswer(req, res) {
    // get `fromtime` parameter from request query
    var fromTime = req.query.fromtime ? Number(req.query.fromtime) : 0;
    var sessionId = req.header('session-id');
    var arrayOffers = [];
    if (answers.size != 0 && answers.has(sessionId)) {
        arrayOffers = Array.from(answers.get(sessionId));
    }
    if (fromTime > 0) {
        arrayOffers = arrayOffers.filter(function (v) { return v[1].datetime > fromTime; });
    }
    var obj = arrayOffers.map(function (v) { return ({ connectionId: v[0], sdp: v[1].sdp }); });
    res.json({ answers: obj });
}
exports.getAnswer = getAnswer;
function getCandidate(req, res) {
    // get `fromtime` parameter from request query
    var fromTime = req.query.fromtime ? Number(req.query.fromtime) : 0;
    var sessionId = req.header('session-id');
    var connectionIds = Array.from(clients.get(sessionId));
    var arr = [];
    for (var _i = 0, connectionIds_1 = connectionIds; _i < connectionIds_1.length; _i++) {
        var connectionId = connectionIds_1[_i];
        var pair = connectionPair.get(connectionId);
        if (pair == null) {
            continue;
        }
        var otherSessionId = sessionId === pair[0] ? pair[1] : pair[0];
        if (!candidates.get(otherSessionId) || !candidates.get(otherSessionId).get(connectionId)) {
            continue;
        }
        var arrayCandidates = candidates.get(otherSessionId).get(connectionId)
            .filter(function (v) { return v.datetime > fromTime; })
            .map(function (v) { return ({ candidate: v.candidate, sdpMLineIndex: v.sdpMLineIndex, sdpMid: v.sdpMid }); });
        if (arrayCandidates.length === 0) {
            continue;
        }
        arr.push({ connectionId: connectionId, candidates: arrayCandidates });
    }
    res.json({ candidates: arr });
}
exports.getCandidate = getCandidate;
function createSession(sessionId, res) {
    clients.set(sessionId, new Set());
    offers.set(sessionId, new Map());
    answers.set(sessionId, new Map());
    candidates.set(sessionId, new Map());
    res.json({ sessionId: sessionId });
}
exports.createSession = createSession;
function deleteSession(req, res) {
    var id = req.header('session-id');
    offers.delete(id);
    answers.delete(id);
    candidates.delete(id);
    clients.delete(id);
    res.sendStatus(200);
}
exports.deleteSession = deleteSession;
function createConnection(req, res) {
    var sessionId = req.header('session-id');
    var connectionId = req.body.connectionId;
    if (connectionId == null) {
        res.status(400).send({ error: new Error("connectionId is required") });
        return;
    }
    var polite = true;
    if (isPrivate) {
        if (connectionPair.has(connectionId)) {
            var pair = connectionPair.get(connectionId);
            if (pair[0] != null && pair[1] != null) {
                var err = new Error(connectionId + ": This connection id is already used.");
                console.log(err);
                res.status(400).send({ error: err });
                return;
            }
            else if (pair[0] != null) {
                connectionPair.set(connectionId, [pair[0], sessionId]);
                var map = getOrCreateConnectionIds(pair[0]);
                map.add(connectionId);
            }
        }
        else {
            connectionPair.set(connectionId, [sessionId, null]);
            polite = false;
        }
    }
    var connectionIds = getOrCreateConnectionIds(sessionId);
    connectionIds.add(connectionId);
    res.json({ connectionId: connectionId, polite: polite });
}
exports.createConnection = createConnection;
function deleteConnection(req, res) {
    var sessionId = req.header('session-id');
    var connectionId = req.body.connectionId;
    clients.get(sessionId).delete(connectionId);
    if (connectionPair.has(connectionId)) {
        var pair = connectionPair.get(connectionId);
        var otherSessionId = pair[0] == sessionId ? pair[1] : pair[0];
        if (otherSessionId) {
            if (clients.has(otherSessionId)) {
                clients.get(otherSessionId).delete(connectionId);
            }
        }
    }
    connectionPair.delete(connectionId);
    offers.get(sessionId).delete(connectionId);
    answers.get(sessionId).delete(connectionId);
    candidates.get(sessionId).delete(connectionId);
    res.json({ connectionId: connectionId });
}
exports.deleteConnection = deleteConnection;
function postOffer(req, res) {
    var sessionId = req.header('session-id');
    var connectionId = req.body.connectionId;
    var keySessionId = null;
    var polite = false;
    if (isPrivate) {
        if (connectionPair.has(connectionId)) {
            var pair = connectionPair.get(connectionId);
            keySessionId = pair[0] == sessionId ? pair[1] : pair[0];
            if (keySessionId != null) {
                polite = true;
                var map_1 = offers.get(keySessionId);
                map_1.set(connectionId, new offer_1.default(req.body.sdp, Date.now(), polite));
            }
        }
        res.sendStatus(200);
        return;
    }
    connectionPair.set(connectionId, [sessionId, null]);
    keySessionId = sessionId;
    var map = offers.get(keySessionId);
    map.set(connectionId, new offer_1.default(req.body.sdp, Date.now(), polite));
    res.sendStatus(200);
}
exports.postOffer = postOffer;
function postAnswer(req, res) {
    var sessionId = req.header('session-id');
    var connectionId = req.body.connectionId;
    var connectionIds = getOrCreateConnectionIds(sessionId);
    connectionIds.add(connectionId);
    if (!connectionPair.has(connectionId)) {
        res.sendStatus(200);
        return;
    }
    // add connectionPair
    var pair = connectionPair.get(connectionId);
    var otherSessionId = pair[0] == sessionId ? pair[1] : pair[0];
    if (!isPrivate) {
        connectionPair.set(connectionId, [otherSessionId, sessionId]);
    }
    var map = answers.get(otherSessionId);
    map.set(connectionId, new answer_1.default(req.body.sdp, Date.now()));
    // update datetime for candidates
    var mapCandidates = candidates.get(otherSessionId);
    if (mapCandidates) {
        var arrayCandidates = mapCandidates.get(connectionId);
        if (arrayCandidates) {
            for (var _i = 0, arrayCandidates_1 = arrayCandidates; _i < arrayCandidates_1.length; _i++) {
                var candidate = arrayCandidates_1[_i];
                candidate.datetime = Date.now();
            }
        }
    }
    res.sendStatus(200);
}
exports.postAnswer = postAnswer;
function postCandidate(req, res) {
    var sessionId = req.header('session-id');
    var connectionId = req.body.connectionId;
    var map = candidates.get(sessionId);
    if (!map.has(connectionId)) {
        map.set(connectionId, []);
    }
    var arr = map.get(connectionId);
    var candidate = new candidate_1.default(req.body.candidate, req.body.sdpMLineIndex, req.body.sdpMid, Date.now());
    arr.push(candidate);
    res.sendStatus(200);
}
exports.postCandidate = postCandidate;
