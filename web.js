"use strict";

/*jslint white: true, todo: true */
/*global require: true, process: true, __dirname: true, console: true, JoelPurra: true */

var express = require('express'),
    cheerio = require("cheerio"),
    extend = require("extend"),
    callWithFirstInArray = require("./callWithFirstInArray.js"),
    app = express(),
    JoelPurra = JoelPurra || {},
    port = process.env.PORT || 5000,
    // The database name has to be in the URI - refactor to use that instead of a separate variable
    mongoUri = process.env.MONGOLAB_URI || 'mongodb://localhost/claimid-dump',
    mongoDbName = "claimid-dump",
    dumpedDataVersion = 0,
    // TODO: break out lists of cache site to a module
    getClaimIdUrl = function(username) {
        // This function is modified client side code, and should be rewritten to more of a server side format.
        var claimIdBaseUrl = "http://claimid.com/",
            claimIdUrl = claimIdBaseUrl + username;

        return claimIdUrl;
    },
    getClaimIdCacheUrl = function(username) {
        // This function is modified client side code, and should be rewritten to more of a server side format.
        var googleCacheBaseUrl = "http://webcache.googleusercontent.com/search?q=cache:",

            encodeUrl = function(url) {
                return encodeURI(url);
            },

            claimIdUrl = getClaimIdUrl(username),

            url = googleCacheBaseUrl + encodeUrl(claimIdUrl);

        return url;
    },
    database = require("./database.js")({
        uri: mongoUri,
        databaseName: mongoDbName
    });

app.use(express.logger());

(function(namespace, pluginName) {
    // This function quite obviously is a modified client side plugin, and should be rewritten to more of a server side format.
    var $,

        dateFormatRx = /\d{4}-\d{2}-\d{2}/,

        internal = {
            extractLink: function() {
                var $this = $(this),
                    $link = $this.find(".taggedlink"),
                    who = $this.find(".info_link").text().split("&nbsp;")[0].split("|").map(function(str) {
                        return str.trim().split("\n")[0].trim();
                    }),
                    result = {
                        url: $link.attr("href"),
                        title: $link.text().trim(),
                        tags: $this.find("[rel~=tag]").map(function() {
                            return $(this).text();
                        }),
                        description: $this.find(".public_description").first().text(),
                        added: $this.find(".date_added").text().match(dateFormatRx)[0],
                        date: $this.find(".date").text(),
                        about: who[0],
                        by: who[1],
                        color: $this.find("a").first().find("img").attr("alt").replace("Star_", "")
                    };

                return result;
            },

            extractGroup: function() {
                var $this = $(this),
                    titleHtml = $this.find(".group_header").first().html(),
                    result = {
                        title: titleHtml.substring(0, titleHtml.indexOf("<")).trim(),
                        description: $this.find(".group_description .text").text(),
                        links: $this.find(".xfolkentry").map(internal.extractLink)
                    };

                return result;
            },

            getCachedDate: function() {
                try {
                    var div = $("div div").first();
                    var text = div.text();
                    var gmtSplit = text.split("GMT");
                    console.log("gmtSplit", gmtSplit)
                    var appearSplit = gmtSplit[0].trim().split("appeared on");
                    var dateTimeUtcValue = new Date(appearSplit[1].trim() + " GMT").valueOf();

                    return dateTimeUtcValue;
                } catch (e) {
                    console.error("Could not parse the cache date.")
                }

                return undefined;
            },

            getCachedUrl: function() {
                try {
                    var url = $("div div").first().find("a").first().attr("href");

                    return url;
                } catch (e) {
                    console.error("Could not parse the cache date.")
                }

                return undefined;
            },

            dump: function($context) {
                var groups = $(".display_group", $context),
                    result = {
                        cachedUrl: internal.getCachedUrl(),
                        cachedAt: internal.getCachedDate(),
                        groups: groups.length === 0 ? undefined : groups.map(internal.extractGroup)
                    };

                return result;
            }
        },

        plugin = {
            dump: function(cheerio, $context) {
                $ = cheerio;
                return internal.dump($context);
            }
        },

        init = function() {
            namespace[pluginName] = plugin;
        };

    init();

}(JoelPurra, "claimIdDump"));

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

    function sendForwardedHttpStatusCode(error, responseHttp) {
        if (typeof error === "number" && error >= 100 && error <= 999) {
            response.send(error);
            response.end();
        }
    }

    var username = checkAndCleanUsername(request.query.username),
        url = getClaimIdCacheUrl(username);

    if (!username) {
        response.send(422);
        response.end();
        return;
    }

    database.Users.getOrCreate(username)
        .fail(handleError)
        .done(function(user) {
            database.HttpCache.getLatestOneOrRequestAndCache(url, true)
                .fail(sendForwardedHttpStatusCode)
                .fail(handleError)
                .done(function(cachedRequest) {
                    database.Dumped.getLatestOne(user._id)
                        .fail(handleError)
                        .done(function(cachedDump) {
                            function getResult(user, cachedRequest, generatedAt, dumped) {
                                var meta = {
                                    username: user.username,
                                    generatedAt: generatedAt,
                                    cacheUrl: cachedRequest.url
                                },
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
                                    dumped = JoelPurra.claimIdDump.dump($),
                                    generatedAt = new Date().valueOf(),
                                    result = getResult(user, cachedRequest, generatedAt, dumped),
                                    toCache = {
                                        user_id: user._id,
                                        httpCache_id: cachedRequest._id,
                                        generatedAt: generatedAt,
                                        version: dumpedDataVersion,
                                        data: result
                                    };

                                database.Dumped.insert(toCache)
                                    .fail(handleError)
                                    .done(callWithFirstInArray(handleCachedDump));
                            } else {
                                handleCachedDump(cachedDump);
                            }
                        });
                });
        });
});

app.use(express.static(__dirname + '/public'));

app.listen(port, function() {
    console.log("Listening on " + port);
});