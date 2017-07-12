"use strict";

/*jslint white: true, todo: true */
/*global require: true, process: true, __dirname: true, console: true */

var configuration = require("configvention"),
    port = configuration.get("PORT"),
    mongoUri = configuration.get("MONGOLAB_URI"),
    siteRootRelativePath = configuration.get("site-root"),

    dumpedDataVersion = 0,
    relativePathToRootFromThisFile = "..",

    express = require('express'),
    path = require("path"),
    cheerio = require("cheerio"),
    extend = require("extend"),

    callWithFirstInArray = require("../lib/callWithFirstInArray.js"),
    htmlDataExtractor = require("../lib/html-data-extraction/google-web-cache.js"),

    resolvePath = function() {
        var args = [].slice.call(arguments),
            parts = [__dirname].concat(args);

        return path.resolve.apply(path, parts);
    },
    resolvePathFromProjectRoot = function() {
        var args = [].slice.call(arguments),
            parts = [relativePathToRootFromThisFile].concat(args);

        return resolvePath.apply(null, parts);
    },

    // Path to static resources like index.html, css etcetera
    siteRootPath = resolvePathFromProjectRoot.apply(null, siteRootRelativePath.split("/")),

    // TODO: break out lists of cache site to a module
    getClaimIdUrl = function(username) {
        // This function is modified client side code, and should be rewritten to more of a server side format.
        var claimIdBaseUrl = "http://claimid.com/",
            claimIdUrl = claimIdBaseUrl + username;

        return claimIdUrl;
    },

    getClaimIdCacheUrl = function(username) {
        // This function is modified client side code, and should be rewritten to more of a server side format.
        var googleCacheBaseUrl = "https://webcache.googleusercontent.com/search?q=cache:",

            encodeUrl = function(url) {
                return encodeURI(url);
            },

            claimIdUrl = getClaimIdUrl(username),

            url = googleCacheBaseUrl + encodeUrl(claimIdUrl);

        return url;
    },

    database = require("./data/data-layer-wrapper.js")({
        uri: mongoUri
    }),

    logger = require("express-bunyan-logger"),

    app = express();

app.use(logger());

app.get("/dump/", function(request, response, next) {
    function checkAndClean(str, disallowedRx, allowedRx) {
        if (disallowedRx.test(str) || !allowedRx.test(str)) {
            return null;
        }

        return str;
    }

    function checkAndCleanUsername(username) {
        var clean = checkAndClean(username, /[^a-z0-9\-]/i, /^[a-z0-9\-]{1,64}$/i);

        if (clean) {
            clean = clean.toLowerCase();
        }

        return clean;
    }

    function handleError(error) {
        throw error;
    }

    function sendForwardedHttpStatusCode(forwardedError, forwardedResponse) {
        if (typeof forwardedError === "number" && forwardedError >= 100 && forwardedError <= 999) {
            response.sendStatus(forwardedError);
            response.end();
        }
    }

    var username = checkAndCleanUsername(request.query.username),
        url = getClaimIdCacheUrl(username);

    if (!username) {
        response.sendStatus(422);
        response.end();

        return;
    }

    database.Users.getOrCreate(username)
        .error(handleError)
        .then(function(user) {
            database.HttpCache.getLatestOneOrRequestAndCache(url, true)
                // TODO: the method signature doesn't match?
                // .error(sendForwardedHttpStatusCode)
                .error(handleError)
                .then(function(cachedRequest) {
                    database.Dumped.getLatestOne(user._id)
                        .error(handleError)
                        .then(function(cachedDump) {
                            function getResult(user, cachedRequest, generatedAt, dumped) {
                                var meta = {
                                        username: user.username,
                                        generatedAt: generatedAt,
                                        cacheUrl: cachedRequest.url,
                                    },
                                    // TODO: replace with copyDeep call?
                                    result = extend({}, meta, dumped);

                                return result;
                            }

                            function send(result) {
                                response.json(result);
                                response.end();
                            }

                            function handleCachedDump(fromCache) {
                                var result = fromCache.data;

                                send(result);
                            }

                            if (!cachedDump) {
                                if (!cachedRequest || !cachedRequest.response || !cachedRequest.response.statusCode || typeof cachedRequest.response.statusCode !== "number" || cachedRequest.response.statusCode !== 200) {
                                    sendForwardedHttpStatusCode(cachedRequest.response.statusCode, cachedRequest.response);
                                    return;
                                }

                                var $ = cheerio.load(cachedRequest.body),
                                    dumped = htmlDataExtractor($),
                                    generatedAt = new Date().valueOf(),
                                    result = getResult(user, cachedRequest, generatedAt, dumped),
                                    toCache = {
                                        user_id: user._id,
                                        httpCache_id: cachedRequest._id,
                                        generatedAt: generatedAt,
                                        version: dumpedDataVersion,
                                        data: result,
                                    };

                                database.Dumped.insert(toCache)
                                    .error(handleError)
                                    .then(callWithFirstInArray(handleCachedDump));
                            } else {
                                handleCachedDump(cachedDump);
                            }
                        });
                });
        });
});

app.use(express.static(siteRootPath));

app.listen(port, function() {
    console.log("Listening on port", port);
    console.log("Serving site root from folder", siteRootPath);
});
