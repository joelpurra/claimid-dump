"use strict";

/*jslint white: true, todo: true */
/*global require: true, process: true, __dirname: true, console: true, JoelPurra: true */

var express = require('express'),
    cheerio = require("cheerio"),
    extend = require("extend"),
    Deferred = require('Deferred'),
    app = express(),
    JoelPurra = JoelPurra || {},
    port = process.env.PORT || 5000,
    mongoUri = process.env.MONGOLAB_URI || 'mongodb://localhost/',
    mongoDbName = "claimdid-dump",
    MongoDBManagment = (function(mongo) {
        function Server(uri) {
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

        Server.prototype.with = function() {
            var deferred = new Deferred(),
                mongoClient = new mongo.MongoClient(new mongo.Server("localhost", 27017));

            mongoClient.open(function(error, mongoClient) {
                if (error) {
                    deferred.reject(error);
                }

                // TODO: mongoClient.close();
                deferred.resolve(mongoClient);
            });

            return deferred.promise();
        };

        Server.prototype.getDatabase = function(name) {
            return new Database(this, name);
        };

        Database.prototype.with = function() {
            var deferred = new Deferred();

            this.server.with()
                .fail(deferred.reject)
                .done(function(mongoClient) {
                    var database = mongoClient.db(this.name);

                    deferred.resolve(database);
                }.bind(this));

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
                }.bind(this));

            return deferred.promise();
        };

        Collection.prototype.find = function(query, fields, options) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.findOne(query, fields, options, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(result);
                    });
                }.bind(this));

            return deferred.promise();
        };

        Collection.prototype.findOne = function(query, fields, options) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.findOne(query, fields, options, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(result);
                    });
                }.bind(this));

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
                }.bind(this));

            return deferred.promise();
        };

        Collection.prototype.remove = function(_id) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.remove({
                        _id: _id
                    }, {
                        safe: true
                    }, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(result);
                    });
                }.bind(this));

            return deferred.promise();
        };

        Collection.prototype.save = function(object) {
            var deferred = new Deferred();

            this.with()
                .fail(deferred.reject)
                .done(function(collection) {
                    collection.save(object, {
                        safe: true
                    }, function(error, result) {
                        if (error) {
                            deferred.reject(error);
                        }

                        deferred.resolve(result);
                    });
                }.bind(this));

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
                }.bind(this));

            return deferred.promise();
        };

        var api = {
            Server: Server
        };

        return api;
    }(require('mongodb'))),
    DB = {
        Users: (function() {
            // TODO: class inheritance/aliasing
            var Users = new MongoDBManagment.Server(mongoUri).getDatabase(mongoDbName).getCollection("users");
            Users.getOrCreate = function(username) {
                var deferred = new Deferred(),
                    userToFind = {
                        username: username
                    };

                this.findOne(userToFind)
                    .fail(deferred.reject)
                    .done(function(user) {
                        if (user) {
                            deferred.resolve(user);
                        } else {
                            this.insert(userToFind)
                                .fail(deferred.reject)
                                .done(function(user) {
                                    deferred.resolve(user);
                                });
                        }
                    });

                return deferred;
            }

            return Users;
        }()),
        HttpCache: (function() {
            // TODO: class inheritance/aliasing
            var HttpCache = new MongoDBManagment.Server(mongoUri).getDatabase(mongoDbName).getCollection("http-cache");

            return HttpCache;
        }()),
        Dumped: (function() {
            // TODO: class inheritance/aliasing
            var Dumped = new MongoDBManagment.Server(mongoUri).getDatabase(mongoDbName).getCollection("dumped");

            return Dumped;
        }())
    },
    requestHTTPDeferred = (function(requestHTTP) {
        var request = function(url) {
            var deferred = new Deferred();
            requestHTTP(url, function(error, responseHTTP, bodyHtml) {
                if (error) {
                    deferred.reject(error);
                } else {
                    deferred.resolve(responseHTTP, bodyHtml);
                }
            });

            return deferred;
        };

        return request;
    }(require("request")));

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

var getClaimIdUrl = function(username) {
    // This function is modified client side code, and should be rewritten to more of a server side format.
    var claimIdBaseUrl = "http://claimid.com/",
        claimIdUrl = claimIdBaseUrl + username,

    return claimIdUrl;
};

var getClaimIdCacheUrl = function(username) {
    // This function is modified client side code, and should be rewritten to more of a server side format.
    var googleCacheBaseUrl = "http://webcache.googleusercontent.com/search?q=cache:",

        encodeUrl = function(url) {
            return encodeURI(url);
        },

        claimIdUrl = getClaimIdUrl(username),

        url = googleCacheBaseUrl + encodeUrl(claimIdUrl);

    return url;
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

    function handleError(error) {
        throw error;
    }

    var username = checkAndCleanUsername(request.query.username),
        url = getClaimIdCacheUrl(username);

    DB.Users.getOrCreate(username)
        .fail(handleError)
        .done(function(user) {
            DB.HttpCache.findOne({
                cachedUrl: getClaimIdUrl(username)
            }, {
                sort: [
                    ["cachedAt", "desc"]
                ]
            })
                .fail(handleError)
                .done(function() {
                    requestHTTPDeferred(url)
                        .fail(handleError)
                        .done(function() {
                            var $ = cheerio.load(bodyHtml),
                                dumped = JoelPurra.claimIdDump.dump($),
                                meta = {
                                    username: username,
                                    generatedAt: new Date().valueOf(),
                                    cacheUrl: url
                                },
                                result = extend({}, meta, dumped);

                            response.json(result);
                        });
                });
        });
});

app.use(express.static(__dirname + '/public'));

app.listen(port, function() {
    console.log("Listening on " + port);
});