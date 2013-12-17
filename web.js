"use strict";

/*jslint white: true, todo: true */
/*global require: true, process: true, __dirname: true, console: true, JoelPurra: true */

var express = require('express'),
    requestHTTP = require("request"),
    cheerio = require("cheerio"),
    extend = require("extend"),
    mongo = require('mongodb'),
    Deferred = require('Deferred'),
    app = express(),
    JoelPurra = JoelPurra || {},
    port = process.env.PORT || 5000,
    mongoUri = process.env.MONGOLAB_URI || 'mongodb://localhost/',
    mongoDbName = "claimdid-dump",
    MongoDBManagment = (function() {
        function Server(mongo, uri) {
            this.mongo = mongo;
            this.uri = uri;

            return this;
        }

        function Database(server, name) {
            this.server = server;
            this.name = name;

            return this;
        }

        function Collection(database, name) {
            this.database = database;
            this.name = name;

            return this;
        }

        Server.prototype.getDatabase = function(name) {
            return new Database(this, name);
        };

        Database.prototype.getDatabaseUri = function() {
            return this.server.uri + this.name;
        };

        Database.prototype.with = function() {
            var deferred = new Deferred();

            this.server.mongo.connect(this.getDatabaseUri(), function(error, database) {
                if (error) {
                    deferred.reject(error);
                }

                // TODO: close database, database.close()
                deferred.resolve(database);
            });

            return deferred.promise();
        };

        Database.prototype.getCollection = function(name) {
            return new Collection(this, name);
        };

        Collection.prototype.with = function() {
            var deferred = new Deferred();

            this.database.with()
                .fail(deferred.reject)
                .done(function(database) {
                    database.collection(this.name, function(error, collection) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(collection);
                    });
                });

            return deferred.promise();
        };

        Collection.prototype.findOne = function(criteria) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.findOne(criteria, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(result);
                    });
                });

            return deferred.promise();
        };

        Collection.prototype.get = function(_id) {
            var deferred = new Deferred();

            this.findOne({
                _id: _id
            })
                .fail(deferred.reject)
                .done(deferred.resolve);

            return deferred.promise();
        };

        Collection.prototype.insert = function(object) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.insert(object, {
                        safe: true
                    }, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(result);
                    });
                });

            return deferred.promise();
        };

        Collection.prototype.getOrInsert = function(object) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.findOne({
                        _id: object._id
                    }, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        if (!result) {
                            this.insert(object)
                                .fail(deferred.reject)
                                .done(deferred.resolve);
                        } else {
                            deferred.resolve(result);
                        }
                    });
                });

            return deferred.promise();
        };

        var api = {
            Server: Server
        };

        return api;
    }());

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

var getClaimIdCacheUrl = function(username) {
    // This function is modified client side code, and should be rewritten to more of a server side format.
    var claimIdBaseUrl = "http://claimid.com/",

        googleCacheBaseUrl = "http://webcache.googleusercontent.com/search?q=cache:",

        encodeUrl = function(url) {
            return encodeURI(url);
        },

        dump = function(username) {
            var claimIdUrl = claimIdBaseUrl + username,

                url = googleCacheBaseUrl + encodeUrl(claimIdUrl);

            return url;
        };

    return dump(username);
};

app.get("/dump/", function(request, response, next) {
    function checkAndClean(str, disallowedRx, allowedRx) {
        if (disallowedRx.test(str) || !allowedRx.test(str)) {
            response.send(422);
        }

        return str;
    }

    function checkAndCleanUsername(username) {
        var clean = checkAndClean(username, /[^a-z0-9\-]/i, /^[a-z0-9\-]{1,64}$/i);

        clean = clean.toLowerCase();

        return clean;
    }

    var username = checkAndCleanUsername(request.query.username),
        url = getClaimIdCacheUrl(username);

    var users = new MongoDBManagment.Server(mongo, mongoUri).getDatabase(mongoDbName).getCollection("users");

    var fromDb = users.findOne({
        username: username
    });

    response.json({
        test: true,
        fromDb: fromDb
    });

    // requestHTTP(url, function(error, responseHTTP, bodyHtml) {
    //     var $ = cheerio.load(bodyHtml),
    //         dumped = JoelPurra.claimIdDump.dump($),
    //         meta = {
    //             username: username,
    //             generatedAt: new Date().valueOf(),
    //             cacheUrl: url
    //         },
    //         result = extend({}, meta, dumped);

    //     response.json(result);
    // });
});

app.use(express.static(__dirname + '/public'));

app.listen(port, function() {
    console.log("Listening on " + port);
});